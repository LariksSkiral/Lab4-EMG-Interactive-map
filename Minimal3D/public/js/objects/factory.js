/* This file has functions to create and load 3D objects, like models and shapes. We need this to add things to the scene. Without it, there would be nothing to see in 3D. For beginners: This is like a factory that builds and imports 3D items so we can place them in our virtual world. */
/* Factory for creating objects - Functions to make and add 3D objects to the scene */
W3D.Factory = {
  // Shared DRACOLoader instance — reused across all GLTFLoader calls so DRACO-compressed
  // models load correctly without needing a separate decoder per request.
  _dracoLoader: (() => {
    const draco = new THREE.DRACOLoader();
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
    return draco;
  })(),

  _makeLoader() {
    const loader = new THREE.GLTFLoader();
    loader.setDRACOLoader(this._dracoLoader);
    return loader;
  },

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
    // Tune imported model materials in one place.
    // This is where we reduce visual striping caused by harsh highlights and low-angle texture sampling.
    const maxAnisotropy = (W3D.renderer && W3D.renderer.capabilities)
      ? W3D.renderer.capabilities.getMaxAnisotropy()
      : 1;

    // Turn on shadow receiving, but do not force every mesh to cast shadows.
    // For many detailed models, all-mesh casting often causes visible shadow acne lines.
    model.traverse(child => {
      if (!child.isMesh) return;

      child.castShadow = false;
      child.receiveShadow = true;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        if (!material) return;

        // Keep specular highlights a little softer to avoid bright aliasing bands.
        if (typeof material.roughness === 'number' && material.roughness < 0.35) {
          material.roughness = 0.35;
        }

        // Normal maps can be too strong for realtime shadowed scenes.
        // A lower normal scale often removes striping without making assets look flat.
        if (material.normalScale && typeof material.normalScale.set === 'function') {
          material.normalScale.set(0.6, 0.6);
        }

        const textureKeys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'];
        textureKeys.forEach(key => {
          const texture = material[key];
          if (!texture) return;

          // Better filtering at grazing angles helps remove crawling/striped details.
          texture.anisotropy = Math.min(8, maxAnisotropy);
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.needsUpdate = true;

          // Normal maps must stay in linear color space.
          if (key === 'normalMap') {
            texture.encoding = THREE.LinearEncoding;
          }
        });

        material.needsUpdate = true;
      });
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
        link1: options.link1 || options.courseLink || null,
        link2: options.link2 || options.maintenanceLink || null,
        link3: options.link3 || options.safetyLink || null,
        courseLink: options.courseLink || options.link1 || null,
        maintenanceLink: options.maintenanceLink || options.link2 || null,
        safetyLink: options.safetyLink || options.link3 || null,
        storagePath: props.storagePath || '',
        createdFromDatabase: Boolean(options.createdFromDatabase),
      },
      files: [],
      static: Boolean(options.static),
    };

    W3D.objects.push(obj);

    if (!obj.static && !obj.props.createdFromDatabase && W3D.History) {
      W3D.History.recordAddition(obj);
    }

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
    const loader = this._makeLoader();
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
    const loader = this._makeLoader();
    return new Promise((resolve, reject) => {
      loader.load(path, gltf => {
        const model = gltf.scene;
        const obj = this._registerLoadedModel(
          model,
          'gltf',
          path.split('/').pop().replace(/\.(glb|gltf)$/i, ''),
          { filepath: path },
          { static: true }
        );
        // The floor plan is a solid slab; after _groundModel the bottom is at y=0
        // and the top surface is at y=thickness. Shift it down so the top is flush
        // with y=0 (the grid/floor level).
        if (path.toLowerCase().includes('plattegrond')) {
          const box = new THREE.Box3().setFromObject(model);
          model.position.y -= box.max.y;

          const matOverrides = {
            'plattegrond': { color: 0xffffff /*, roughness: 0.8, metalness: 0.0, opacity: 1.0 },
            'olieopslag':  { /* color: 0xffffff, roughness: 0.8, metalness: 0.0, opacity: 1.0 */ },
            'richtlijnen': { /* color: 0xffffff, roughness: 0.8, metalness: 0.0, opacity: 1.0 */ },
            'zebrapad':    { /* color: 0xffffff, roughness: 0.8, metalness: 0.0, opacity: 1.0 */ },
            'Zone 1':      { /* color: 0xffffff, roughness: 0.8, metalness: 0.0, opacity: 1.0 */ },
            'Zone 2':      { /* color: 0xffffff, roughness: 0.8, metalness: 0.0, opacity: 1.0 */ },
            'Zone 3':      { /* color: 0xffffff, roughness: 0.8, metalness: 0.0, opacity: 1.0 */ },
            'Zone 4':      { /* color: 0xffffff, roughness: 0.8, metalness: 0.0, opacity: 1.0 */ },
            'Zone 5':      { /* color: 0xffffff, roughness: 0.8, metalness: 0.0, opacity: 1.0 */ },
          };
          gltf.scene.traverse(child => {
            if (!child.isMesh) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
              const overrides = matOverrides[mat.name];
              if (!overrides) return;
              if (overrides.color     !== undefined) mat.color.set(overrides.color);
              if (overrides.roughness !== undefined) mat.roughness = overrides.roughness;
              if (overrides.metalness !== undefined) mat.metalness = overrides.metalness;
              if (overrides.opacity   !== undefined) { mat.opacity = overrides.opacity; mat.transparent = overrides.opacity < 1; }
              mat.needsUpdate = true;
            });
          });
        }

        // Handle pillar model with same render settings but as a separate instance
        if (path.toLowerCase().includes('pilaar')) {
          const box = new THREE.Box3().setFromObject(model);
          model.position.y -= box.min.y;

          const pillarMatOverrides = {
            'pilaar': { color: 0xffffff /*, roughness: 0.8, metalness: 0.0, opacity: 1.0 */ },
            // Add more pillar-specific materials here if needed
          };
          gltf.scene.traverse(child => {
            if (!child.isMesh) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
              const overrides = pillarMatOverrides[mat.name];
              if (!overrides) return;
              if (overrides.color     !== undefined) mat.color.set(overrides.color);
              if (overrides.roughness !== undefined) mat.roughness = overrides.roughness;
              if (overrides.metalness !== undefined) mat.metalness = overrides.metalness;
              if (overrides.opacity   !== undefined) { mat.opacity = overrides.opacity; mat.transparent = overrides.opacity < 1; }
              mat.needsUpdate = true;
            });
          });
        }

        // Handle walls model with same render settings but as a separate instance
        if (path.toLowerCase().includes('walls')) {
          const box = new THREE.Box3().setFromObject(model);
          model.position.y -= box.min.y;

          const wallsMatOverrides = {
            'walls': { color: 0xffffff /*, roughness: 0.8, metalness: 0.0, opacity: 1.0 */ },
            // Add more walls-specific materials here if needed
          };
          gltf.scene.traverse(child => {
            if (!child.isMesh) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
              const overrides = wallsMatOverrides[mat.name];
              if (!overrides) return;
              if (overrides.color     !== undefined) mat.color.set(overrides.color);
              if (overrides.roughness !== undefined) mat.roughness = overrides.roughness;
              if (overrides.metalness !== undefined) mat.metalness = overrides.metalness;
              if (overrides.opacity   !== undefined) { mat.opacity = overrides.opacity; mat.transparent = overrides.opacity < 1; }
              mat.needsUpdate = true;
            });
          });
        }
        resolve(obj);
      }, undefined, err => {
        console.error('Failed to load local model:', err); // Log errors
        reject(err);
      });
    });
  },

  // Load a 3D model from a remote URL (for example: Supabase Storage public file URL)
  loadRemoteGLTF(url, displayName = 'Supabase Model', options = {}) {
    const loader = this._makeLoader();
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

        // Apply material overrides for Supabase-loaded models (machines, not map or pillar)
        // Customize roughness, metalness, and opacity per material name
        const supabaseMaterialOverrides = {
          // Define material-specific settings here by material name
          // Example: 'metalPart': { roughness: 0.3, metalness: 0.9, opacity: 1.0 },
          // Example: 'glassPart': { roughness: 0.1, metalness: 0.0, opacity: 0.7 },
        };

        gltf.scene.traverse(child => {
          if (!child.isMesh) return;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(mat => {
            // Check if this material has specific overrides
            const overrides = supabaseMaterialOverrides[mat.name];
            
            // Apply overrides if they exist, otherwise use the material from the GLB file
            if (overrides) {
              if (overrides.roughness !== undefined) mat.roughness = overrides.roughness;
              if (overrides.metalness !== undefined) mat.metalness = overrides.metalness;
              if (overrides.opacity !== undefined) { mat.opacity = overrides.opacity; mat.transparent = overrides.opacity < 1; }
            }
            // Uncomment below to apply default settings to all materials not in overrides:
            else {
            //   mat.roughness = 0.7;      // Slightly rough (not too shiny)
               mat.metalness = 0.7;      // Non-metallic by default
            //   mat.opacity = 1.0;
            //   mat.transparent = false;
             }
            mat.needsUpdate = true;
          });
        });

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