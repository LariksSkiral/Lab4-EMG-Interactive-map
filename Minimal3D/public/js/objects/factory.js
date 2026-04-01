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

  // Move a loaded model so its lowest point touches the floor (y = 0).
  // This keeps every imported model standing on the grid instead of floating.
  _groundModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const minY = box.min.y;
    if (minY !== undefined && !Number.isNaN(minY)) {
      model.position.y -= minY;
    }
  },

  // Final shared registration step for imported GLTF/GLB models.
  // We use one helper so local files, storage files, and database-restored files
  // all create object records with the same shape.
  _registerLoadedModel(model, type, name, props = {}, options = {}) {
    // Turn on shadows for every mesh inside the imported model.
    model.traverse(child => {
      child.castShadow = true;
      child.receiveShadow = true;
    });

    // Place the model neatly on the floor before applying saved transforms.
    this._groundModel(model);

    // Apply saved placement data when it exists.
    if (typeof options.positionX === 'number') model.position.x = options.positionX;
    if (typeof options.positionY === 'number') model.position.y = options.positionY;
    if (typeof options.positionZ === 'number') model.position.z = options.positionZ;
    if (typeof options.rotationX === 'number') model.rotation.x = options.rotationX;
    if (typeof options.rotationY === 'number') model.rotation.y = options.rotationY;
    if (typeof options.rotationZ === 'number') model.rotation.z = options.rotationZ;

    W3D.scene.add(model);

    const obj = {
      id: W3D.genId(),
      mesh: model,
      type,
      name,
      color: '#ffffff',
      props: {
        ...props,
        machineId: options.machineId || null,
        machineTypeId: options.machineTypeId || null,
        machineTypeLinkId: options.machineTypeLinkId || null,
        storagePath: props.storagePath || '',
        createdFromDatabase: Boolean(options.createdFromDatabase),
      },
      files: [],
      static: Boolean(options.static),
    };

    W3D.objects.push(obj);

    // Models that were added manually in the editor should immediately show
    // the unsaved-changes warning until the admin clicks Save.
    if (!obj.static && !obj.props.createdFromDatabase && W3D.Database) {
      W3D.Database.markSceneDirty();
    }

    return obj;
  },

  // Load a 3D model from a .glb or .gltf file
  loadGLB(file) {
    const url = URL.createObjectURL(file); // Create a temporary URL for the file
    const loader = new THREE.GLTFLoader(); // Loader for GLTF models
    return new Promise((resolve, reject) => {
      loader.load(url, gltf => {
        const obj = this._registerLoadedModel(
          gltf.scene,
          'glb',
          file.name.replace(/\.(glb|gltf)$/i, ''),
          { filename: file.name }
        );
        URL.revokeObjectURL(url);
        resolve(obj);
      }, undefined, err => {
        console.error('Failed to load model:', err); // Log errors
        URL.revokeObjectURL(url);
        reject(err);
      });
    });
  },

  // Load a 3D model from a local .glb or .gltf file path
  loadLocalGLTF(path) {
    const loader = new THREE.GLTFLoader(); // Loader for GLTF models
    return new Promise((resolve, reject) => {
      loader.load(path, gltf => {
        const obj = this._registerLoadedModel(
          gltf.scene,
          'gltf',
          path.split('/').pop().replace(/\.(glb|gltf)$/i, ''),
          { filepath: path },
          { static: true }
        );
        resolve(obj);
      }, undefined, err => {
        console.error('Failed to load local model:', err); // Log errors
        reject(err);
      });
    });
  },

  // Load a 3D model from a remote URL (for example: Supabase Storage public file URL)
  loadRemoteGLTF(url, displayName = 'Supabase Model', options = {}) {
    const loader = new THREE.GLTFLoader(); // Loader for GLTF models
    return new Promise((resolve, reject) => {
      loader.load(url, gltf => {
        const obj = this._registerLoadedModel(
          gltf.scene,
          'gltf',
          displayName.replace(/\.(glb|gltf)$/i, ''),
          {
            filepath: url,
            storagePath: options.storagePath || '',
          },
          options
        );
        resolve(obj);
      }, undefined, err => {
        console.error('Failed to load remote model:', err); // Log errors
        reject(err);
      });
    });
  },

  // Create a simple box (cube) object
  box({ width = 2, height = 2, depth = 2, color = '#8a9aaa' } = {}) {
    const geo = new THREE.BoxGeometry(width, height, depth); // Shape of the box
    const mesh = new THREE.Mesh(geo, this._mat(color)); // Combine shape and material
    return this._register(mesh, 'box', 'Box', color, { width, height, depth, color });
  },
};