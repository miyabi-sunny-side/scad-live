scad_live_material = "all";
echo(scad_live_materials = ["primary", "secondary"]);
if (scad_live_material == "all" || scad_live_material == "primary")
    cube([10, 10, 2]);
if (scad_live_material == "all" || scad_live_material == "secondary")
    translate([10, 0, 0]) cube([10, 10, 2]);
