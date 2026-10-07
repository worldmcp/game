// Asset manifest. Every third-party asset is listed with its source and
// licence; ASSETS.md is the human-readable version. Swapping an asset means
// changing one path here.

const base = new URL('../../assets/', import.meta.url).href;

export const MODELS = {
  // Animation sets (Microsoft Rocketbox, motion capture): idle, walk, run, wave, talk.
  anims_m: { url: `${base}models/people/anims_m.glb`, kind: 'anims' },
  anims_f: { url: `${base}models/people/anims_f.glb`, kind: 'anims' },
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

// Realistic people (Microsoft Rocketbox Avatar Library, MIT). `core` avatars
// load before entering the world; the rest stream in afterwards.
export const PEOPLE = [
  { id: 'female_adult_01', gender: 'f', label: 'Casual · Ava', core: true },
  { id: 'male_adult_01', gender: 'm', label: 'Casual · Leo', core: true },
  { id: 'female_adult_05', gender: 'f', label: 'Casual · Zara', core: true },
  { id: 'male_adult_04', gender: 'm', label: 'Casual · Kofi', core: true },
  { id: 'business_female_02', gender: 'f', label: 'Business · Nia' },
  { id: 'business_male_02', gender: 'm', label: 'Business · Theo' },
  { id: 'female_adult_03', gender: 'f', label: 'Casual · Mei' },
  { id: 'male_adult_08', gender: 'm', label: 'Casual · Sam' },
  { id: 'female_adult_08', gender: 'f', label: 'Casual · Ines' },
  { id: 'male_adult_11', gender: 'm', label: 'Casual · Dev' },
  { id: 'female_adult_12', gender: 'f', label: 'Smart · Ada' },
  { id: 'male_adult_15', gender: 'm', label: 'Smart · Marcus' },
  { id: 'female_adult_15', gender: 'f', label: 'Street · Kemi' },
  { id: 'male_adult_19', gender: 'm', label: 'Traditional · Omar' },
  { id: 'chef_female_01', gender: 'f', label: 'Chef · Lena' },
  { id: 'construction_male_01', gender: 'm', label: 'Builder · Joe' },
];
for (const p of PEOPLE) MODELS[p.id] = { url: `${base}models/people/${p.id}.glb`, kind: 'person' };

export const TEXTURES = {
  waterNormals: `${base}textures/waternormals.jpg`,
};

export const CREDITS = [
  { asset: '16 realistic people + motion-capture animations (idle, walk, run, wave, talk)', source: 'Microsoft Rocketbox Avatar Library (converted to glTF, textures resized)', license: 'MIT', url: 'https://github.com/microsoft/Microsoft-Rocketbox' },
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
