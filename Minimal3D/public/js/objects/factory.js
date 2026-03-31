/* This file has functions to create and load 3D objects, like models and shapes. We need this to add things to the scene. Without it, there would be nothing to see in 3D. For beginners: This is like a factory that builds and imports 3D items so we can place them in our virtual world. */
/* Factory for creating objects - Functions to make and add 3D objects to the scene */
W3D.Factory = {
  // Helper to create a material (color and appearance) for meshes
  _mat(color = '#8a9aaa', opts = {}) {
    return new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      side: THREE.DoubleSide, // Visible from both sides
      ...opts,
    });
  },

  // Helper to add a mesh to the scene and track it
  _register(mesh, type, name, color, props) {
    mesh.name = name;
    mesh.castShadow = true; // Can cast shadows
    mesh.receiveShadow = true; // Can receive shadows
    W3D.scene.add(mesh); // Add to the 3D scene
    const obj = { id: W3D.genId(), mesh, type, name, color, props: props || {}, files: [] };
    W3D.objects.push(obj); // Store in our objects list
    return obj;
  },

  // Load a 3D model from a .glb or .gltf file
  loadGLB(file) {
    const url = URL.createObjectURL(file); // Create a temporary URL for the file
    const loader = new THREE.GLTFLoader(); // Loader for GLTF models
    loader.load(url, gltf => {
      const model = gltf.scene; // The loaded 3D model
      // Enable shadows on all parts of the model
      model.traverse(c => { c.castShadow = true; c.receiveShadow = true; });

      // No scaling – 1 Blender meter = 1 Three.js unit
      // Ground the model on y=0
      const box = new THREE.Box3().setFromObject(model);
      const minY = box.min.y;
      if (minY !== undefined && !Number.isNaN(minY)) {
        model.position.y -= minY;
      }

      W3D.scene.add(model); // Add model to scene
      const obj = {
        id: W3D.genId(), mesh: model, type: 'glb',
        name: file.name.replace(/\.(glb|gltf)$/i, ''), // Remove file extension from name
        color: '#ffffff', props: { filename: file.name }, files: [],
      };
      W3D.objects.push(obj); // Track the model
      URL.revokeObjectURL(url); // Clean up temporary URL
    }, undefined, err => {
      console.error('Failed to load model:', err); // Log errors
      URL.revokeObjectURL(url);
    });
  },

  // Load a 3D model from a local .glb or .gltf file path
  loadLocalGLTF(path) {
    const loader = new THREE.GLTFLoader(); // Loader for GLTF models
    loader.load(path, gltf => {
      const model = gltf.scene; // The loaded 3D model
      // Enable shadows on all parts of the model
      model.traverse(c => { c.castShadow = true; c.receiveShadow = true; });

      // No scaling – 1 Blender meter = 1 Three.js unit
      // Ground the model on y=0
      const box = new THREE.Box3().setFromObject(model);
      const minY = box.min.y;
      if (minY !== undefined && !Number.isNaN(minY)) {
        model.position.y -= minY;
      }

      W3D.scene.add(model); // Add model to scene
      const obj = {
        id: W3D.genId(), mesh: model, type: 'gltf',
        name: path.split('/').pop().replace(/\.(glb|gltf)$/i, ''), // Get filename from path
        color: '#ffffff', props: { filepath: path }, files: [],
        static: true, // Local base map: not selectable or moveable
      };
      W3D.objects.push(obj); // Track the model
    }, undefined, err => {
      console.error('Failed to load local model:', err); // Log errors
    });
  },

  // Load a 3D model from a remote URL (for example: Supabase Storage public file URL)
  loadRemoteGLTF(url, displayName = 'Supabase Model') {
    const loader = new THREE.GLTFLoader(); // Loader for GLTF models
    loader.load(url, gltf => {
      const model = gltf.scene; // The loaded 3D model
      // Enable shadows on all parts of the model
      model.traverse(c => { c.castShadow = true; c.receiveShadow = true; });

      // No scaling – 1 Blender meter = 1 Three.js unit
      // Ground the model on y=0
      const box = new THREE.Box3().setFromObject(model);
      const minY = box.min.y;
      if (minY !== undefined && !Number.isNaN(minY)) {
        model.position.y -= minY;
      }

      W3D.scene.add(model); // Add model to scene
      const obj = {
        id: W3D.genId(), mesh: model, type: 'gltf',
        name: displayName.replace(/\.(glb|gltf)$/i, ''),
        color: '#ffffff', props: { filepath: url }, files: [],
      };
      W3D.objects.push(obj); // Track the model
    }, undefined, err => {
      console.error('Failed to load remote model:', err); // Log errors
    });
  },

  // Create a simple box (cube) object
  box({ width = 2, height = 2, depth = 2, color = '#8a9aaa' } = {}) {
    const geo = new THREE.BoxGeometry(width, height, depth); // Shape of the box
    const mesh = new THREE.Mesh(geo, this._mat(color)); // Combine shape and material
    return this._register(mesh, 'box', 'Box', color, { width, height, depth, color });
  },
};