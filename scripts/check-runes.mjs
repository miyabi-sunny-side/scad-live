import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseJavaScript } from 'acorn';
import { parse as parseSvelte } from 'svelte/compiler';

const sourceRoot = path.resolve('client/src');
const legacyNodes = new Set([
  'LegacyReactiveStatement',
  'LegacyComponent',
  'OnDirective',
  'LetDirective',
]);
const legacyImports = new Set([
  'afterUpdate',
  'beforeUpdate',
  'createEventDispatcher',
]);
const htmlMutationMethods = new Set([
  'after',
  'append',
  'appendChild',
  'before',
  'insertAdjacentHTML',
  'prepend',
  'removeChild',
  'replaceChildren',
  'setAttribute',
]);
const domCreationMethods = new Set([
  'createElement',
  'createElementNS',
  'createTextNode',
  'getElementById',
  'querySelector',
  'querySelectorAll',
]);
const failures = [];

const visit = (node, callback) => {
  if (!node || typeof node !== 'object') return;
  callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, callback);
    } else if (value && typeof value === 'object') {
      visit(value, callback);
    }
  }
};

const filesUnder = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(target) : [target];
    }),
  );
  return nested.flat();
};

const propertyName = (member) =>
  member.computed ? member.property.value : member.property.name;

const isRendererCanvas = (node) =>
  node?.type === 'MemberExpression' &&
  !node.computed &&
  node.object?.type === 'Identifier' &&
  node.object.name === 'renderer' &&
  node.property?.name === 'domElement';

const isMount = (node) => node?.type === 'Identifier' && node.name === 'mount';

const allowedAdapterMutation = (file, node, method) =>
  file.endsWith('/lib/three-viewer.js') &&
  ['appendChild', 'removeChild'].includes(method) &&
  isMount(node.callee.object) &&
  node.arguments.length === 1 &&
  isRendererCanvas(node.arguments[0]);

const allowedBootstrapLookup = (file, node, method) =>
  file.endsWith('/main.js') &&
  method === 'getElementById' &&
  node.arguments.length === 1 &&
  node.arguments[0]?.value === 'app';

const inspectJavaScript = (file, program, svelteScript = false) => {
  visit(program, (node) => {
    if (node.type === 'LabeledStatement' && node.label?.name === '$')
      failures.push(`${file}: legacy reactive statement`);
    if (
      svelteScript &&
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'VariableDeclaration' &&
      node.declaration.kind === 'let'
    )
      failures.push(`${file}: legacy exported prop`);
    if (node.type === 'ImportDeclaration') {
      if (
        node.source.value === 'svelte/legacy' ||
        node.source.value.startsWith('svelte/internal')
      )
        failures.push(`${file}: legacy Svelte module import`);
      if (node.source.value === 'svelte') {
        for (const specifier of node.specifiers) {
          if (legacyImports.has(specifier.imported?.name))
            failures.push(
              `${file}: legacy Svelte import ${specifier.imported.name}`,
            );
        }
      }
    }

    if (
      node.type === 'AssignmentExpression' &&
      node.left.type === 'MemberExpression'
    ) {
      const property = propertyName(node.left);
      if (
        ['className', 'innerHTML', 'outerHTML', 'textContent'].includes(
          property,
        )
      )
        failures.push(`${file}: raw HTML assignment ${property}`);
    }

    if (
      node.type !== 'CallExpression' ||
      node.callee.type !== 'MemberExpression'
    )
      return;
    const method = propertyName(node.callee);
    if (htmlMutationMethods.has(method)) {
      if (!allowedAdapterMutation(file, node, method))
        failures.push(`${file}: raw DOM mutation ${method}()`);
      return;
    }
    if (domCreationMethods.has(method)) {
      if (!allowedBootstrapLookup(file, node, method))
        failures.push(`${file}: raw DOM access ${method}()`);
    }
  });
};

for (const absolute of await filesUnder(sourceRoot)) {
  if (!absolute.endsWith('.js') && !absolute.endsWith('.svelte')) continue;
  const file = absolute.split(path.sep).join('/');
  const source = await fs.readFile(absolute, 'utf8');
  if (absolute.endsWith('.svelte')) {
    const ast = parseSvelte(source, { modern: true });
    visit(ast, (node) => {
      if (legacyNodes.has(node.type))
        failures.push(`${file}: legacy node ${node.type}`);
    });
    for (const match of source.matchAll(
      /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g,
    )) {
      inspectJavaScript(
        file,
        parseJavaScript(match[1], {
          ecmaVersion: 'latest',
          sourceType: 'module',
        }),
        true,
      );
    }
  } else {
    inspectJavaScript(
      file,
      parseJavaScript(source, { ecmaVersion: 'latest', sourceType: 'module' }),
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Svelte runes and DOM boundary checks passed.');
}
