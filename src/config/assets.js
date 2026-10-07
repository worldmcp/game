// Asset manifest. Every third-party asset is listed with its source and
// licence; ASSETS.md is the human-readable version. Swapping an asset means
// changing one path here.

const base = new URL('../../assets/', import.meta.url).href;

export const MODELS = {
  // People (rigged, animated). Source: three.js examples (Mixamo characters).
  michelle: { url: `${base}models/people/michelle.glb`, height: 1.72, kind: 'person' },
  soldier: { url: `${base}models/people/soldier.glb`, height: 1.8, kind: 'person' },
  // Vehicles
  car: { url: `${base}models/vehicles/car.glb`, length: 4.4, kind: 'vehicle' },
  // Products (Khronos glTF Sample Assets)
  shoe: { url: `${base}models/products/shoe.glb`, size: 0.32 },
  watch: { url: `${base}models/products/watch.glb`, size: 0.12 },
  camera: { url: `${base}models/products/camera.glb`, size: 0.28 },
  boombox: { url: `${base}models/products/boombox.glb`, size: 0.5 },
  lantern: { url: `${base}models/products/lantern.glb`, size: 0.6 },
  bottle: { url: `${base}models/products/bottle.glb`, size: 0.26 },
  avocado: { url: `${base}models/products/avocado.glb`, size: 0.12 },
  chair: { url: `${base}models/products/chair.glb`, size: 0.95 },
  sofa: { url: `${base}models/products/sofa.glb`, size: 2.1 },
  pouf: { url: `${base}models/products/pouf.glb`, size: 0.6 },
  plant: { url: `${base}models/products/plant.glb`, size: 1.1 },
  vase: { url: `${base}models/products/vase.glb`, size: 0.5 },
  fridge: { url: `${base}models/products/fridge.glb`, size: 2 },
  toycar: { url: `${base}models/products/toycar.glb`, size: 0.3 },
  olives: { url: `${base}models/products/olives.glb`, size: 0.22 },
};

export const TEXTURES = {
  waterNormals: `${base}textures/waternormals.jpg`,
};

export const CREDITS = [
  { asset: 'Michelle, Soldier (rigged characters + Idle/Walk/Run)', source: 'three.js examples (r160) · originally Mixamo / Adobe', license: 'Mixamo terms — royalty-free use inside projects; confirm before commercial launch', url: 'https://github.com/mrdoob/three.js/tree/r160/examples/models/gltf' },
  { asset: 'Car Concept', source: 'Khronos glTF Sample Assets · Eric Chadwick / Darmstadt Graphics Group', license: 'CC BY 4.0 (logo meshes removed)', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept' },
  { asset: 'Materials Variants Shoe', source: 'Khronos glTF Sample Assets · Shopify', license: 'CC BY 4.0', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/MaterialsVariantsShoe' },
  { asset: 'Chronograph Watch', source: 'Khronos glTF Sample Assets · Eric Chadwick', license: 'CC BY 4.0', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ChronographWatch' },
  { asset: 'Antique Camera', source: 'Khronos glTF Sample Assets · UX3D', license: 'CC0 1.0', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/AntiqueCamera' },
  { asset: 'BoomBox, Lantern, Water Bottle, Avocado', source: 'Khronos glTF Sample Assets · Microsoft', license: 'CC0 1.0', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets' },
  { asset: 'Sheen Chair', source: 'Khronos glTF Sample Assets · Wayfair', license: 'CC0 1.0', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair' },
  { asset: 'Glam Velvet Sofa', source: 'Khronos glTF Sample Assets · Wayfair', license: 'CC BY 4.0', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlamVelvetSofa' },
  { asset: 'Specular Silk Pouf', source: 'Khronos glTF Sample Assets · Wayfair', license: 'CC BY 4.0', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SpecularSilkPouf' },
  { asset: 'Diffuse Transmission Plant', source: 'Khronos glTF Sample Assets · Eric Chadwick', license: 'CC BY 4.0', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/DiffuseTransmissionPlant' },
  { asset: 'Glass Vase Flowers', source: 'Khronos glTF Sample Assets · Wayfair', license: 'CC0 1.0', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlassVaseFlowers' },
  { asset: 'Commercial Refrigerator', source: 'Khronos glTF Sample Assets · Shopify', license: 'CC BY 4.0', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CommercialRefrigerator' },
  { asset: 'Toy Car', source: 'Khronos glTF Sample Assets · Guido Odendahl', license: 'CC0 1.0', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ToyCar' },
  { asset: 'Iridescent Dish With Olives', source: 'Khronos glTF Sample Assets · Wayfair', license: 'CC BY 4.0', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/IridescentDishWithOlives' },
  { asset: 'Water normals texture', source: 'three.js examples', license: 'MIT (three.js)', url: 'https://github.com/mrdoob/three.js/tree/r160/examples/textures' },
  { asset: 'three.js r160 + addons', source: 'mrdoob/three.js', license: 'MIT', url: 'https://github.com/mrdoob/three.js' },
  { asset: 'City buildings, roads, trees, signage, textures', source: 'Procedurally generated by Pludor World', license: 'Original work', url: '' },
];
