// https://www.khronos.org/files/gltf20-reference-guide.pdf
// validate export here: https://github.khronos.org/glTF-Validator/
RD.GLTF = {
	BYTE: 5120,
	UNSIGNED_BYTE: 5121,
	SHORT: 5122,
	UNSIGNED_SHORT: 5123,
	UNSIGNED_INT: 5125,
	FLOAT: 5126,

	JSON_CHUNK: 0x4E4F534A,
	BINARY_CHUNK: 0x004E4942,

	buffer_names: {
		POSITION: "vertices",
		NORMAL: "normals",
		COLOR_0: "colors",
		TEXCOORD_0: "coords",
		TEXCOORD_1: "coords1",
		WEIGHTS_0: "weights",
		JOINTS_0: "bones"
	},

	numComponents: { "SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT4":16 },

	rename_animation_properties: { "translation":"position","scale":"scaling" },

	flip_uv: true,
	convert_skeletons: false,
	overwrite_materials: true,
	rename_assets: false, //force assets to have unique names (materials, meshes)

	prefabs: {},
	meshes: {},
	
	texture_options: { format: GL.RGBA, magFilter: GL.LINEAR, minFilter: GL.LINEAR_MIPMAP_LINEAR, wrap: GL.REPEAT, no_flip: false },
	supports_anisotropy: false,
	force_anisotropy: false,

	nodes_by_index: {},

	load: function( url, callback, extension, callback_progress )
	{
		if(!url)
			throw("url missing");
		var json = null;
		var filename = "";
		var folder = "";

		if(typeof(gl) !== "undefined")
		{
			this.meshes = gl.meshes;
			if( gl.extensions.EXT_texture_filter_anisotropic )
				this.supports_anisotropy = true;
		}

		//its a regular url
		if(url.constructor === String)
		{
			folder = url.split("/");
			filename = folder.pop();
			extension = extension || filename.split(".").pop().toLowerCase();
			folder = folder.join("/");

			//console.log("loading gltf json...");
			if(typeof(fs) !== "undefined") //nodejs
			{
				var data = new Uint8Array( fs.readFileSync(url,{}).buffer );
				onData(data.buffer);
			}
			else
			{
				var xhr = new XMLHttpRequest();
				xhr.onload = function() {
					if(this.status != 200)
					{
						console.error("GLTF not found",url);
						if(callback)
							callback(null);
						return;
					}
					//console.log("Loaded: ",xhr.status,xhr.response );
					onData(xhr.response);
				};

				xhr.onerror = function() { // only triggers if the request couldn't be made at all
				console.error("Network Error");
				if(callback)
					callback(null);
				};

				if(callback_progress)
					xhr.onprogress = function(event) { // triggers periodically
					callback_progress(url, event.loaded, event.total);
					};

				xhr.responseType = extension == "gltf" ? "json" : "arraybuffer";
				xhr.open('GET', url);
				xhr.send();
			}
		}
		else //array of files already loaded
		{
			var files_data = url;
			//console.log(files_data);
			filename = files_data["main"];
			if(!filename)
				return;

			url = filename;
			var main = files_data[ filename ];
			if(main.extension == "glb")
			{
				json = RD.GLTF.parseGLB(main.data);
				if(!json)
					return;
				onFetchComplete();
				return;
			}
			json = main.data;

			//gltf
			this.parseBuffers(json);

			onFetchComplete();
		}

		function fetchBinaries( list )
		{
			var buffer = list.pop();
			var bin_url = folder + "/" + buffer.uri;

			if( buffer.uri.substr(0,5) == "blob:")
				bin_url = buffer.uri;

			//console.log(" - loading " + buffer.uri + " ...");
			if( buffer.uri.substr(0,5) == "data:")
			{
				var data = _base64ToArrayBuffer( buffer.uri.substr(37) );
				onBinary.call({buffer:buffer}, data );
			}
			else
				fetch( bin_url ).then(function(response) {
					return response.arrayBuffer();
				}).then(onBinary.bind({buffer:buffer}));

			function onBinary( data )
			{
				var buffer = this.buffer;
				buffer.data = data;
				buffer.dataview = new Uint8Array(data);
				//if(data.byteLength != buffer.byteLength) //it is always different ??
				//	console.warn("gltf binary doesnt match json size hint");
				if(list.length)
					fetchBinaries( list );
				else
					onFetchComplete();
			}
		}

		function onFetchComplete()
		{
			//console.log("parsing gltf ...");
			json.filename = filename;
			json.folder = folder;
			json.url = url;
			RD.GLTF.parseBuffers(json,files_data);
			var node = RD.GLTF.parse( json );
			var data = node.serialize(); 
			RD.GLTF.prefabs[ url ] = data;
			if(callback)
				callback(node);
		}

		//after fetching the data
		function onData(data)
		{
			if( extension == "gltf" )
			{
				json = data;
				//console.log("loading gltf binaries...");
				fetchBinaries( json.buffers.concat() );
			}
			else if( extension == "glb" )
			{
				json = RD.GLTF.parseGLB(data);
				if(!json)
				{
					console.error("error parsing GLB:", filename );
					return;
				}
				onFetchComplete();
			}
		}
	},

	parseBuffers: function(json, files_data)
	{
		for(var i = 0; i < json.buffers.length; ++i)
		{
			var buffer = json.buffers[i];
			if(buffer.data)
				continue;
			var data = null;
			if( buffer.uri && buffer.uri.substr(0,5) == "data:")
			{
				var index = buffer.uri.indexOf(",");
				buffer.data = _base64ToArrayBuffer( buffer.uri.substr(index+1) );
			}
			else
			{
				if(!files_data)
					throw("missing data in glb");
				var file = files_data[ buffer.uri ];
				buffer.data = file.data;
			}

			buffer.dataview = new Uint8Array( buffer.data );
			/*
			if(data.byteLength != buffer.byteLength)
				console.warn("gltf binary doesnt match json size hint");
			*/
		}
	},

	parseGLB: function(data)
	{
		var view = new Uint8Array( data );

		//read header
		var endianess = true;
		var dv = new DataView( data );
		var magic = dv.getUint32(0,endianess);

		if(magic != 0x46546C67)
		{
			console.error("incorrect gltf header");
			return null;
		}
		var version = dv.getUint32(4,endianess);
		console.log("GLTF Version: " + version);

		var length = dv.getUint32(8,endianess); //full size

		var byteOffset = 12;
		var json = null;
		var chunk_index = 0;

		//first chunk
		while(byteOffset < view.length)
		{
			var chunk_size = dv.getUint32(byteOffset,endianess);
			var chunk_type = dv.getUint32(byteOffset+4,endianess);
			var chunk_data = data.slice(byteOffset+8, byteOffset+8+chunk_size);
			byteOffset += 8 + chunk_size;

			if(chunk_type == RD.GLTF.JSON_CHUNK)
			{
				if (typeof(TextDecoder) === "undefined")
				  throw("Sorry, this browser does not support TextDecoder...");

				var enc = new TextDecoder("utf-8");
				var str = enc.decode(chunk_data);
				json = JSON.parse(str);
			}
			else if(chunk_type == RD.GLTF.BINARY_CHUNK)
			{
				var buffer = json.buffers[chunk_index];
				buffer.data = chunk_data;
				buffer.dataview = new Uint8Array(chunk_data);
				//if(data.byteLength != buffer.byteLength)
				//	console.warn("gltf binary doesnt match json size hint");
				chunk_index++;
			}
			else
				console.warn("gltf unknown chunk type: ", "0x"+chunk_type.toString(16));
		}

		return json;
	},

	parse: function(json, filename)
	{
		console.log(json);

		if(!json.url)
			json.url = filename || "scene.glb";

		var root = null;
		var nodes_by_id = {};
		this.nodes_by_index = {};
		if( json.scenes.length > 1 )
			console.warn("gltf importer only supports one scene per file, skipping the rest");

		var scene = json.scenes[ json.scene || 0 ];
		var nodes_info = scene.nodes;
		this.gltf_materials = {};

		//preparse ASCII Buffer if there is any
		if(json.buffers && json.buffers.length)
		{
			for(var i = 0; i < json.buffers.length;++i)
			{
				var buffer = json.buffers[i];
				if(buffer.uri && !buffer.data && buffer.uri.substr(0,5) == "data:")
				{
					buffer.data = _base64ToArrayBuffer( buffer.uri.substr(37) );
					buffer.dataview = new Uint8Array(buffer.data);
				}
			}
		}

		if(json.skins)
		{
			for(var i = 0; i < json.skins.length; ++i)
			{
				var skin = json.skins[i];
				for(var j = 0; j < skin.joints.length; ++j)
				{
					json.nodes[ skin.joints[j] ]._is_joint = true;
				}
			}
		}

		var root = null;
		if(nodes_info.length > 1) //multiple root nodes
		{
			root = new RD.SceneNode();
			root.name = "root";
		}

		//build hierarchy first so if somebody references it exists already
		for(var i = 0; i < json.nodes.length; ++i)
		{
			var info = json.nodes[i];
			var node = null;
			if(info.extensions && info.extensions.KHR_lights_punctual)
				node = new RD.Light();
			else
				node = new RD.SceneNode();
			if(info.name)
				node.name = info.name;
			this.nodes_by_index[i] = node;				
		}
	
		//now parse content
		for(var i = 0; i < nodes_info.length; ++i)
		{
			var index = nodes_info[i];
			//if(info.node != null)//????
			//	index = info.node;
			var node = this.nodes_by_index[index];
			RD.GLTF.parseNode( node, index, json );
			if(!root)
				root = node;
			if(nodes_info.length > 1)
				root.addChild( node );
			node.id = json.url.replace(/\//gi,"_") + "::node_" + index;
			nodes_by_id[ node.id ] = nodes_by_id[ i ] = node;
		}

		if(json.animations && json.animations.length)
		{
			if(!RD.Animation)
				console.error("you must include rendeer-animation.js to allow animations");
			else
			{
				root.animations = [];
				for(var i = 0; i < json.animations.length; ++i)
				{
					var animation = this.parseAnimation(i,json,nodes_by_id);
					animation.id = json.filename + "::" + animation.name;
					if(animation)
					{
						RD.Animations[ animation.id ] = animation;
						root.animations.push(animation);
					}
				}
			}
			
			if(this.convert_skeletons)
				this.convertSkinToSkeleton(root,root);
		}

		root.materials = this.gltf_materials;
		root.meta = {
			asset: json.asset
		};
		return root;
	},

	parseNode: function(node, index, json)
	{
		var info = json.nodes[ index ];

		if(info.extensions && info.extensions.KHR_lights_punctual)
			node = node || new RD.Light();
		else
			node = node || new RD.SceneNode();

		//extract node info
		for(var i in info)
		{
			var v = info[i];
			switch(i)
			{
				case "name": node.name = v; break;
				case "translation": node.position = v; break;
				case "rotation": node.rotation = v; break;
				case "scale": node.scaling = v;
					var numneg = 0; //GLTFs and negative scales are pain in the ass
					if (node.scaling[0] < 0)
						numneg++;
					if (node.scaling[1] < 0)
						numneg++;
					if (node.scaling[2] < 0)
						numneg++;
					if( numneg%2 == 1)
						node.flags.frontFace = GL.CW; //reverse
					break;
				case "matrix": 
					node.fromMatrix( v );
					var det = mat4.determinant( v );
					if( det < 0 )
						node.flags.frontFace = GL.CW; //reverse
					break;
				case "mesh": 
					var mesh = RD.GLTF.parseMesh(v, json);
					if(mesh)
					{
						node.mesh = mesh.name;
						node.primitives = [];
						for(var j = 0; j < mesh.info.groups.length; ++j)
						{
							var group = mesh.info.groups[j];
							var material = null;
							if(group.material != null)
								material = this.parseMaterial( group.material, json );
							node.primitives.push({
								index: j, 
								material: material ? material.name : null, //meshes without material can exists
								mode: group.mode
							});
							if(!node.material && material)
								node.material = material.name;
						}
						if(mesh.morphs)
							node.morphs = mesh.morphs.map(m=>{return { name: m.name, weight: m.weight }});
						}
					break;
				case "skin":
					node.skin = this.parseSkin( v, json );
					break;
				case "camera":
					node.camera = json.cameras[v];
					break;
				case "children": 
					if(v.length)
					{
						for(var j = 0; j < v.length; ++j)
						{
							var subnode_info = json.nodes[ v[j] ];
							var subnode = RD.GLTF.parseNode( null, v[j], json );
							node.addChild(subnode);
						}
					}
					break;
				case "extras":
				case "extra":
					node.extras = v;
					break;
				case "extensions":
					if(v.KHR_lights_punctual)
					this.parseLight(node, json.extensions.KHR_lights_punctual.lights[ v.KHR_lights_punctual.light ] );
					break;
				default:
					if( i[0] != "_" )
						console.log("gltf node info ignored:",i,info[i]);
					break;
			}
		}

		if(node.mesh && node.skin)
		{
			var mesh = this.meshes[ node.mesh ];
			mesh.bones = [];
			for(var j = 0; j < node.skin.joints.length; ++j)
			{
				var bonename = node.skin.joints[j];
				var bindpose = node.skin.bindMatrices[j];
				mesh.bones.push([bonename,bindpose]);
			}
		}


		if(!info.name)
			info.name = node.name = "node_" + index;

		if(info._is_joint)
			node.is_joint = true;

		return node;
	},

	parseLight: function(light, info)
	{
		if(info.color)
			light.color = info.color;
		else
			light.color = [1,1,1];
		if(info.intensity != null)
			vec3.scale( light.color, light.color, info.intensity / 1000);
		if(info.type === "spot")
			light.light_type = RD.SPOT_LIGHT;
		else if(info.type === "point")
			light.light_type = RD.POINT_LIGHT;
		else if(info.type === "directional")
			light.light_type = RD.DIRECTIONAL_LIGHT;
		if(info.spot)
		{
			light.cone_start = info.spot.innerConeAngle * RAD2DEG * 2;
			light.cone_end = info.spot.outerConeAngle * RAD2DEG * 2;
		}
		if(info.range != null)
			light.max_distance = info.range;
	},

	parseMesh: function(index, json)
	{
		var mesh_info = json.meshes[index];
		var meshes_container = this.meshes;

		//extract primitives
		var meshes = [];
		var prims = [];
		var start = 0;
		for(var i = 0; i < mesh_info.primitives.length; ++i)
		{
			var primitive_info = mesh_info.primitives[ i ];
			var prim = this.parsePrimitive( primitive_info, json );
			if(!prim)
				continue;
			var current = null;
			prim.start = start;
			start += prim.length;
			prims.push(prim);
			var mesh_primitive = { vertexBuffers: {}, indexBuffers:{} };
			for(var j in prim.buffers)
			{
				var buffer_name = j;
				if( buffer_name == "bones" )
					buffer_name = "bone_indices";
				if( buffer_name == "indices" || buffer_name == "triangles" )
					mesh_primitive.indexBuffers[buffer_name] = { data: prim.buffers[j] };
				else
					mesh_primitive.vertexBuffers[buffer_name] = { data: prim.buffers[j] };
			}
			var current = { mesh: mesh_primitive };
			meshes.push(current);

			//it has morph targets
			if(primitive_info.targets)
			{
				mesh_primitive.morphs = [];
				for(let j = 0; j < primitive_info.targets.length; ++j)
				{
					var morph_attrs = primitive_info.targets[j];
					var morph = {
						name: "",
						weight: 0,
						buffers: {}
					};
					if(mesh_info.extras && mesh_info.extras.targetNames)
						morph.name = mesh_info.extras.targetNames[j];
					if(mesh_info.weights)
						morph.weight = mesh_info.weights[j];

					//for every possible valid name
					for(var k in this.buffer_names)
					{
						var prop_name = this.buffer_names[k];
						var att_index = morph_attrs[k];
						if(att_index == null)
							continue;
						var data = this.parseAccessor( att_index, json, false );
						if(data)
							morph.buffers[prop_name] = data;
					}

					mesh_primitive.morphs.push( morph );
				}
			}
		}

		//merge primitives: because if submaterials they are independent meshes, and we want one single mesh
		var mesh = null;
		if(meshes.length > 1)
		{
			mesh = GL.Mesh.mergeMeshes( meshes );
		}
		else if (meshes.length == 1) //create a mesh
		{
			var mesh_data = meshes[0].mesh;
			mesh = new GL.Mesh( mesh_data.vertexBuffers, mesh_data.indexBuffers );
			if( mesh.info && mesh_data.info)
				mesh.info = mesh_data.info;
			mesh.morphs = mesh_data.morphs;
		}

		if(!mesh)
			return null;

		for(var i = 0; i < mesh_info.primitives.length; ++i)
		{
			var g = mesh.info.groups[i];
			if(!g)
				mesh.info.groups[i] = g = {};
			var prim = mesh_info.primitives[i];
			g.material = prim.material;
			g.mode = prim.mode != null ? prim.mode : 4; //GL.TRIANGLES
			g.start = prims[i].start;
			g.length = prims[i].length;
		}

		mesh.name = mesh_info.name + "_" + index; //we add the mesh index to the name as there could be several meshes with the same name
		if(!mesh.name || this.rename_assets)
			mesh.name = json.filename + "::mesh_" + (mesh_info.name || index);
		//mesh.material = primitive.material;
		//mesh.primitive = mesh_info.mode;
		//console.log(mesh.constructor.name);

		mesh.updateBoundingBox();
		mesh.computeGroupsBoundingBoxes();
		meshes_container[ mesh.name ] = mesh;

		return mesh;
	},

	parsePrimitive: function( primitive_info, json )
	{
		var primitive = {
			buffers: {}
		};

		var buffers = primitive.buffers;
		if(primitive_info.extensions)
		{
			if(primitive_info.extensions["KHR_draco_mesh_compression"])
			{
				if(typeof(DracoDecoderModule) == "undefined")
					throw("mesh data is compressed using Draco, draco_decoder.js not installed.");
				buffers = primitive.buffers = this.decompressDraco( primitive_info, json );
				if(!buffers)
					return null;
			}
			else
			{
				throw("mesh data is compressed, this importer does not support it yet");
				return null;
			}
		}
		else
		{
			if(!primitive_info.attributes.POSITION == null)
				console.warn("gltf mesh without positions");

			//for every possible valid name
			for(var i in this.buffer_names)
			{
				var prop_name = this.buffer_names[i];
				var att_index = primitive_info.attributes[i];
				if(att_index == null)
					continue;
				var flip = this.flip_uv && (prop_name == "coords" || prop_name == "coords1");
				var data = this.parseAccessor( att_index, json, flip );
				if(data)
				{
					if(i === "COLOR_0") //special case
						data = this.convertVertexColor(data, json.accessors[att_index]);
					buffers[prop_name] = data;
				}
			}

			//indices
			if(primitive_info.indices != null)
				buffers.triangles = this.parseAccessor( primitive_info.indices, json );
		}

		if(!buffers.vertices)
		{
			console.error("primitive without vertices");
			return null;
		}

		primitive.mode = primitive_info.mode;
		primitive.material = primitive_info.material;
		primitive.start = 0;
		primitive.length = buffers.triangles ? buffers.triangles.length : buffers.vertices.length / 3;
		return primitive;
	},

	parseAccessor: function( index, json, flip_y, bufferView, decoder )
	{
		var accessor = json.accessors[index];
		if(!accessor)
		{
			console.warn("gltf accessor not found");
			return null;
		}

		var components = this.numComponents[ accessor.type ];
		if(!components)
		{
			console.warn("gltf accessor of unknown type:",accessor.type);
			return null;
		}

		//num numbers
		var size = accessor.count * components;

		//create buffer
		var databuffer = this.createTypedBuffer( accessor.componentType, size );

		//regular buffer
		if(accessor.bufferView !== undefined)
		{
			bufferView = json.bufferViews[ accessor.bufferView ];
			if(!bufferView)
			{
				console.warn("gltf bufferView not found");
				return null;
			}
			var buffer = json.buffers[ bufferView.buffer ];
			if(!buffer || !buffer.data)
			{
				console.warn("gltf buffer not found or data not loaded");
				return null;
			}

			var databufferview = new Uint8Array( databuffer.buffer );

			if(bufferView.byteOffset == null)//could happend when is 0
				bufferView.byteOffset = 0;

			var start = bufferView.byteOffset + (accessor.byteOffset || 0);

			//is interlaved, then we need to separate it
			if(bufferView.byteStride && bufferView.byteStride != components * databuffer.BYTES_PER_ELEMENT)
			{
				var item_size = components * databuffer.BYTES_PER_ELEMENT;
				var chunk = buffer.dataview.subarray( start, start + bufferView.byteLength );
				var temp = new databuffer.constructor(components);
				var temp_bytes = new Uint8Array(temp.buffer);
				var index = 0;
				for(var i = 0; i < accessor.count; ++i)
				{
					temp_bytes.set( chunk.subarray(index,index+item_size) );
					databuffer.set( temp, i*components );
					index += bufferView.byteStride;
				}
			}
			else
			{
				//extract chunk from binary (not using the size from the bufferView because sometimes it doesnt match!)
				var chunk = buffer.dataview.subarray( start, start + databufferview.length );

				//copy data to buffer
				databufferview.set( chunk );
			}
		}
		else if( accessor.sparse ) //data is indexed to save space in GLTF
		{
			var indices;
			if( accessor.sparse.indices.componentType === RD.GLTF.UNSIGNED_INT )
				indices = new Uint32Array( accessor.sparse.count );
			else if( accessor.sparse.indices.componentType === RD.GLTF.UNSIGNED_SHORT )
				indices = new Uint16Array( accessor.sparse.count );
			else if( accessor.sparse.indices.componentType === RD.GLTF.UNSIGNED_BYTE )
				indices = new Uint8Array( accessor.sparse.count );
			else
				throw "indices in gltf in wrong format";
	
			var start = accessor.sparse.indices.byteOffset || 0;
			var indices_chunk = this.parseBufferView( json, accessor.sparse.indices.bufferView );
			var indices_u8 = new Uint8Array( indices_chunk );
			var indices_temp = new indices.constructor( indices_u8.buffer );
			indices.set(indices_temp);

			//values
			var values;
			var values_size = accessor.sparse.count * components;
			var values = this.createTypedBuffer( accessor.componentType, values_size );
			start = accessor.sparse.values.byteOffset || 0;		
			var values_chunk = this.parseBufferView( json, accessor.sparse.values.bufferView );
			var values_u8 = new Uint8Array( values_chunk );
			var values_temp = new values.constructor( values_u8.buffer );
			values.set( values_temp );

			for(let i = 0; i < indices.length; ++i)			
			{
				var index = indices[i];
				var value = values.subarray(i*components,(i + 1) * components);
				databuffer.set(value, index*components)
			}
		}

		//debug
		if(accessor.min && accessor.max && 0)
		{
			var min = accessor.min;
			var max = accessor.max;
			for(var i = 0; i < databuffer.length; i++)
			{
				if(	databuffer[i] < min[i%components] - 0.00001 || 
					databuffer[i] > max[i%components] + 0.00001 )
					console.log("wrong value:", databuffer[i], min[i%components], max[i%components]);
			}
		}


		//decode?
		//if(decoder)
		//	databufferview = this.decodeBuffer( databufferview.buffer, decoder );

		if(flip_y)
			for(var i = 1; i < databuffer.length; i += components )
				databuffer[i] = 1.0 - databuffer[i]; 

		return databuffer;
	},

	//returns a Uint8Array
	parseBufferView: function( json, bufferview_index )
	{
		var bufferView = json.bufferViews[ bufferview_index ];
		if(!bufferView)
		{
			console.warn("gltf bufferView not found");
			return null;
		}
		var buffer = json.buffers[ bufferView.buffer ];
		if(!buffer || !buffer.data)
		{
			console.warn("gltf buffer not found or data not loaded");
			return null;
		}
		return new Uint8Array( buffer.data, bufferView.byteOffset || 0, bufferView.byteLength );
		//return buffer.dataview.subarray(bufferView.byteOffset || 0, );
	},

	createTypedBuffer: function(componentType,size) {
		switch( componentType )
		{
			case RD.GLTF.FLOAT: return new Float32Array( size ); break;
			case RD.GLTF.UNSIGNED_INT: return new Uint32Array( size ); break;
			case RD.GLTF.SHORT: return new Int16Array( size );  break;
			case RD.GLTF.UNSIGNED_SHORT: return new Uint16Array( size );  break;
			case RD.GLTF.BYTE: return new Int8Array( size );  break;
			case RD.GLTF.UNSIGNED_BYTE: return new Uint8Array( size );  break;
		}	
		console.warn("gltf accessor of unsupported type: ", componentType);
		return new Float32Array( size );
	},

	installDracoModule: function( callback )
	{
		var types = this.draco_data_types = {};

		var that = this;
		//fetch module
		if(this.decoderModule)
		{
			if(callback)
				callback(this.decoderModule);
			return;
		}

		if(typeof(DracoDecoderModule) != "undefined")
			DracoDecoderModule({}).then(function(module) {
				var draco = that.decoderModule = module;
				types[ draco.DT_INT8	] = Int8Array;
				types[ draco.DT_UINT8	] = Uint8Array;
				types[ draco.DT_INT16	] = Int16Array;
				types[ draco.DT_UINT16	] = Uint16Array;
				types[ draco.DT_INT32	] = Int32Array;
				types[ draco.DT_UINT32	] = Uint32Array;
				types[ draco.DT_FLOAT32	] = Float32Array;
				if(callback)
					callback(module);
			});
		else
			console.error("Draco3D not installed");
	},

	decompressDraco: function( primitive_info, json )
	{
		if(!this.decoderModule || !this.decoderModule.Decoder)
		{
			console.warn("Mesh with DRACO encoding, DRACO Decoder Module not found");
			return null;
		}

		if(!this.draco_decoder)
			this.draco_decoder = new this.decoderModule.Decoder();
		var result = this.decodePrimitive( this.draco_decoder, primitive_info, json );
		return result;
	},

	decodePrimitive: function( decoder, primitive_info, json )
	{
		//console.log(primitive_info);
		var ext_data = primitive_info.extensions.KHR_draco_mesh_compression;
		var buffers = {};

		//every mesh is stored in an independent buffer view
		var bufferView = json.bufferViews[ ext_data.bufferView ];
		var buffer = json.buffers[ bufferView.buffer ];
		var rawBuffer = buffer.dataview.buffer;

		//transform buffer view to geometry
		var draco = this.decoderModule;
		var buffer = new draco.DecoderBuffer();
		buffer.Init(new Int8Array(rawBuffer), rawBuffer.byteLength);
		var geometryType = decoder.GetEncodedGeometryType(buffer);
		if (geometryType == draco.TRIANGULAR_MESH) {
			//extract
			var uncompressedDracoMesh = new draco.Mesh();
			var status = decoder.DecodeBufferToMesh( buffer, uncompressedDracoMesh );
			if ( !status.ok() || uncompressedDracoMesh.ptr === 0 ) {
				throw new Error( 'GLTF Draco: Decoding failed: ' + status.error_msg() );
			}

			var size = uncompressedDracoMesh.num_points() * 3;

			//transform from draco geometry to my own format
			for(var i in this.buffer_names)
			{
				var prop_name = this.buffer_names[i];
				var draco_buffer_name = i;
				if( draco_buffer_name == "COLOR_0")
					draco_buffer_name = "COLOR";
				else if( draco_buffer_name == "TEXCOORD_0")
					draco_buffer_name = "TEX_COORD";
				var flip = prop_name == "coords" || prop_name == "coords1";
				var buff = this.decodeBuffer( uncompressedDracoMesh, draco[ draco_buffer_name ], flip, decoder );
				if(buff)
					buffers[prop_name] = buff.data;
			}

			//get indices
			var numFaces = uncompressedDracoMesh.num_faces();
			var numIndices = numFaces * 3;
			var byteLength = numIndices * 4;

			var ptr = draco._malloc( byteLength );
			decoder.GetTrianglesUInt32Array( uncompressedDracoMesh, byteLength, ptr );
			buffers.triangles = new Uint32Array( draco.HEAPF32.buffer, ptr, numIndices ).slice();
			draco._free( ptr );
		}

		draco.destroy( buffer );
		draco.destroy( uncompressedDracoMesh );
		return buffers;
	},

	decodeBuffer: function( uncompressedDracoMesh, index, flip, decoder )
	{
		if(index == null)
			return null;
		var draco = this.decoderModule;
		//transform from draco geometry to my own format
		var attId = decoder.GetAttributeId( uncompressedDracoMesh, index );
		if(attId == -1)
			return null;
		var att = decoder.GetAttribute( uncompressedDracoMesh, attId );
		var data_type = att.data_type();
		var num_comps = att.num_components();
		var num_points = uncompressedDracoMesh.num_points();
		var size = att.size();
		var total_length = num_points * num_comps;
		var ctor = this.draco_data_types[ data_type ];
		var bytes = total_length * ctor.BYTES_PER_ELEMENT;

		//*
		var attData = new draco.DracoFloat32Array();
		decoder.GetAttributeFloatForAllPoints( uncompressedDracoMesh, att, attData );
		var data = new ctor( total_length );
		for(var i = 0; i < data.length; ++i)
			data[i] = attData.GetValue(i);
		//*/
		/*
		var ptr = draco._malloc( bytes );
		decoder.GetAttributeDataArrayForAllPoints( uncompressedDracoMesh, att, data_type, bytes, ptr );
		var data = new ctor( draco.HEAPF32.buffer, ptr, total_length ).slice();
		draco._free( ptr );
		//*/

		if(flip)
			for(var i = 1; i < data.length; i+=num_comps)
				data[i] = 1.0 - data[i];

		return {
			num_points: num_points,
			num_comps: num_comps,
			data_type: data_type,
			data: data
		};
	},

	parseMaterial: function( index, json )
	{
		var info = json.materials[index];
		if(!info)
		{
			console.warn("gltf material not found");
			return null;
		}

		var mat_name = info.name;
		if(!mat_name || this.rename_assets)
			mat_name = json.filename + "::mat_" + (info.name || index);

		var material = RD.Materials[ mat_name ];
		if(material && (!this.overwrite_materials || material.from_filename == json.filename) )
			return material;

		material = new RD.Material();
		material.name = mat_name;
		material.from_filename = json.filename;

		if(info.alphaMode != null)
			material.alphaMode = info.alphaMode;
		material.alphaCutoff = info.alphaCutoff != null ? info.alphaCutoff : 0.5;
		if(info.doubleSided != null)
			material.flags.two_sided = info.doubleSided;
		material.normalmapFactor = 1.0;

		if(info.pbrMetallicRoughness)
		{
			material.model = "pbrMetallicRoughness";

			//default values
			material.color.set([1,1,1]);
			material.opacity = 1;
			material.metallicFactor = 1;
			material.roughnessFactor = 1;

			if(info.pbrMetallicRoughness.baseColorFactor != null)
				material.color = info.pbrMetallicRoughness.baseColorFactor;
			if(info.pbrMetallicRoughness.baseColorTexture)
			{
				material.textures.albedo = this.parseTexture( info.pbrMetallicRoughness.baseColorTexture, json );
				if( material.alphaMode == "MASK" && this.supports_anisotropy && RD.GLTF.force_anisotropy) //force anisotropy
				{
					var tex = gl.textures[ material.textures.albedo.texture ];
					if(tex)
					{
						tex.bind(0);
						gl.texParameteri( gl.TEXTURE_2D, gl.extensions.EXT_texture_filter_anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, 8 );
					}
				}
			}
			if(info.pbrMetallicRoughness.metallicFactor != null)
				material.metallicFactor = info.pbrMetallicRoughness.metallicFactor;
			if(info.pbrMetallicRoughness.roughnessFactor != null)
				material.roughnessFactor = info.pbrMetallicRoughness.roughnessFactor;
			//GLTF do not support metallic or roughtness in individual textures
			if(info.pbrMetallicRoughness.metallicRoughnessTexture) //RED: Occlusion, GREEN: Roughtness, BLUE: Metalness
				material.textures.metallicRoughness = this.parseTexture( info.pbrMetallicRoughness.metallicRoughnessTexture, json );
		}

		if(info.occlusionTexture)
			material.textures.occlusion = this.parseTexture( info.occlusionTexture, json );
		if(info.normalTexture)
			material.textures.normal = this.parseTexture( info.normalTexture, json );
		if(info.emissiveTexture)
			material.textures.emissive = this.parseTexture( info.emissiveTexture, json );
		if(info.emissiveFactor)
			material.emissive = info.emissiveFactor;
		if(info.extensions)
		{
			if( info.extensions.KHR_materials_emissive_strength && material.emissive)
				vec3.scale( material.emissive, material.emissive, info.extensions.KHR_materials_emissive_strength.emissiveStrength );
		}
		if(info.extras)
			material.extras = info.extras;

		if(RD.Materials[ material.name ])
			console.debug("Material overwritten: " + material.name );
		RD.Materials[ material.name ] = material;
		this.gltf_materials[ material.name ] = material;

		return material;
	},

	parseTexture: function( mat_tex_info, json )
	{
		var info = json.textures[ mat_tex_info.index ];
		if(!info)
		{
			console.warn("gltf texture not found");
			return null;
		}

		//no webgl
		if(typeof(gl) === "undefined")
			return null;

		//source
		var source = json.images[ info.source ];
		var extension = "";
		var image_name = null;
		if(source.uri)
		{
			image_name = source.uri;
			extension = image_name.split(".").pop();
		}
		else
		{
			image_name = json.url.replace(/[\/\.\:]/gi,"_") + "_image_" + mat_tex_info.index;// + ".png";
			if( source.mimeType )
				extension = (source.mimeType.split("/").pop());
			else
				extension = "png"; //defaulting
			image_name += "." + extension;
		}


		var result = {};

		var tex = gl.textures[ image_name ];
		if( !tex )
		{
			if(source.uri) //external image file
			{
				var filename = source.uri;
				if(filename.substr(0,5) == "data:")
				{
					var start = source.uri.indexOf(",");
					var mimeType = source.uri.substr(5,start);
					var extension = mimeType.split("/").pop().toLowerCase();
					var image_name = json.folder + "/" + filename + "image_" + mat_tex_info.index + "." + extension;
					var image_bytes = _base64ToArrayBuffer( source.uri.substr(start+1) );
					var image_url = URL.createObjectURL( new Blob([image_bytes],{ type : mimeType }) );
					//var img = new Image(); img.src = image_url; document.body.appendChild(img); //debug
					var texture = GL.Texture.fromURL( image_url, this.texture_options );
					texture.name = image_name;
					gl.textures[ image_name ] = texture;

				}
				else
				{
					if(filename.substr(0,5) == "blob:")
						result.texture = filename;
					else
						result.texture = json.folder + "/" + filename;
				}
			}
			else if(source.bufferView != null) //embeded image file
			{
				var bufferView = json.bufferViews[ source.bufferView ];
				if(bufferView.byteOffset == null)
					bufferView.byteOffset = 0;
				var buffer = json.buffers[ bufferView.buffer ];
				var image_bytes = buffer.data.slice( bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength );
				var image_url = URL.createObjectURL( new Blob([image_bytes],{ type : source.mimeType }) );
				//var img = new Image(); img.src = image_url; document.body.appendChild(img); //debug
				var texture = GL.Texture.fromURL( image_url, this.texture_options );
				texture.name = image_name;
				gl.textures[ image_name ] = texture;
				//special case: this image is lowquality but the highquality is in a folder next to the GLB
				if(json.asset && json.asset.low_quality) //custom hack in the gltfs
				{
					var images_folder = json.folder + "/" + json.filename.replace(/\.[^/.]+$/, "") + "/";
					var hd_url = images_folder + source.name;
					//GL.Texture.fromURL( , { texture: texture } );
					if(!json.asset.hd_textures)
						json.asset.hd_textures = {};
					json.asset.hd_textures[ image_name ] = hd_url;
				}
			}
		}

		if(!result.texture)
			result.texture = image_name;

		//sampler
		if(info.sampler != null)
		{
			var sampler = json.samplers[ info.sampler ];
			if(sampler.magFilter != null)
				result.magFilter = sampler.magFilter;
			if(sampler.minFilter != null)
				result.minFilter = sampler.minFilter;
		}

		if( mat_tex_info.texCoord )
			result.uv_channel = mat_tex_info.texCoord;

		return result;
	},

	parseSkin: function( index, json )
	{
		var info = json.skins[ index ];
		var skin = {};
		if( info.skeleton != null )
			skin.skeleton_root = json.nodes[ info.skeleton ].name;
		var buffer = this.parseAccessor( info.inverseBindMatrices, json );
		if(!buffer)
		{
			console.warn("accessor is null");
			return null;
		}
		skin.bindMatrices = this.splitBuffer( buffer, 16 );
		skin.joints = [];
		for(var i = 0; i < info.joints.length; ++i)
		{
			var node_index = info.joints[i];
			var joint = json.nodes[ node_index ];
			var name = joint.id || joint.name;
			if(!name)
			{
				var node = this.nodes_by_index[node_index];
				if(!node.name)
					node.name = "Node_" + node_index;
				name = joint.name = node.name;
			}
			skin.joints.push( name );
		}
		return skin;
	},

	convertSkinToSkeleton: function(node,root)
	{
		if(node.skin)
		{
			var skeleton_root = root.findNodeByName( node.skin.skeleton_root )
			if(!node.skeleton)
				node.skeleton = new RD.Skeleton();
			node.skeleton.importSkeleton( skeleton_root || root );
		}

		for( var i = 0; i < node.children.length; ++i )
		{
			var child = node.children[i];
			this.convertSkinToSkeleton(child,root);
		}
	},	

	splitBuffer: function( buffer, length )
	{
		if(!buffer)
			console.warn("buffer is null");
		var l = buffer.length;
		var result = [];
		for(var i = 0; i < l; i+= length)
			result.push( new buffer.constructor( buffer.subarray(i,i+length) ) );
		return result;
	},

	convertVertexColor: function( data, accessor )
	{
		if(accessor.type === "VEC4")
			return data;
		var numcomps = accessor.type === "VEC4" ? 4 : 3;
		var datau8 = new Uint8Array(4 * accessor.count);
		var factor = 1;
		if(accessor.componentType === GL.FLOAT)
			factor = 255;
		for(let i = 0; i < data.length; i+= numcomps)
		{
			var j = Math.floor(i/numcomps)*4;
			datau8[j] = data[i] * factor;
			datau8[j+1] = data[i+1] * factor;
			datau8[j+2] = data[i+2] * factor;
			datau8[j+3] = numcomps === 4 ? data[i+3] * factor : factor;
		}
		return datau8;
	},

	//parses an animation and returns it as a RD.Animation
	parseAnimation: function(index, json, nodes_by_id )
	{
		var info = json.animations[index];
		var animation = new RD.Animation();
		animation.name = info.name || "anim_" + index;
		var duration = 0;

		for(var i = 0; i < info.channels.length; ++i)
		{
			var track = new RD.Animation.Track();
			var channel = info.channels[i];
			var sampler = info.samplers[channel.sampler];

			track.target_node = json.nodes[ channel.target.node ].name;
			track.target_property = channel.target.path.toLowerCase();

			var renamed = this.rename_animation_properties[ track.target_property ];
			if(renamed)
				track.target_property = renamed;

			var timestamps = this.parseAccessor( sampler.input, json );
			var keyframedata = this.parseAccessor( sampler.output, json );
			if(!keyframedata)
			{
				console.warn("animation accedor missing")
				continue;
			}

			var out_accessor = json.accessors[ sampler.output ];
			var type = out_accessor.type;
			var type_enum = RD.TYPES[type];
			if( type_enum == RD.VEC4 && track.target_property == "rotation")
				type_enum = RD.QUAT;
			track.type = type_enum;

			//tough mode, we dont support it but we need to convert the data ignoring tangents
			//more info here: https://github.com/KhronosGroup/glTF-Tutorials/blob/main/gltfTutorial/gltfTutorial_007_Animations.md
			if( sampler.interpolation === "CUBICSPLINE") 
			{
				var num_entries = timestamps.length;
				var new_keyframedata = new keyframedata.constructor( keyframedata.length / 3 );
				var num_comps = new_keyframedata.length / num_entries;
				for(let j = 0; j < num_entries; ++j)
				{
					//tangent left, value, tangent right, so we want the middle one
					var sample = keyframedata.subarray(num_comps + j * num_comps * 3, num_comps + j * num_comps * 3 + num_comps);
					new_keyframedata.set( sample, j * num_comps );
				}
				keyframedata = new_keyframedata;
			}

			var num_components = keyframedata.length / timestamps.length;
			if(!num_components)
			{
				console.warn("gltf unknown type:",type);
				continue;
			}
			var num_elements = timestamps.length;
			var keyframes = new Float32Array( (1+num_components) * num_elements );
			for(var j = 0; j < num_elements; ++j)
			{
				keyframes[j*(1+num_components)] = timestamps[j];
				var value = keyframedata.subarray(j*num_components,j*num_components+num_components);
				//if(type_enum == RD.QUAT)
				//	quat.identity(value,value);
				keyframes.set( value, j*(1+num_components)+1 );
			}
			track.data = keyframes;
			track.packed_data = true;
			track.num_components = out_accessor.type === "SCALAR" && num_components > 1 ? num_components : 1;
			duration = Math.max( duration, timestamps[ timestamps.length - 1] );

			animation.addTrack( track );
		}

		animation.duration = duration || 1/25;

		return animation;
	},

	loadFromFiles: function(files,callback)
	{
		//search for .GLTF
		//...
		var files_data = {};
		var pending = files.length;
		var that = this;
		var bins = [];

		for(var i = 0; i < files.length; ++i)
		{
			var file = files[i];
			var reader = new FileReader();
			var t = file.name.split(".");
			var extension = t[ t.length - 1 ].toLowerCase();
			reader.onload = inner;
			reader.filename = file.name;
			reader.extension = extension;
			if(extension == "gltf")
				reader.readAsText(file);
			else
				reader.readAsArrayBuffer(file);
		}

		function inner(e)
		{
			var data = e.target.result;
			var extension = this.extension;
			const magFilter = that.texture_options.magFilter;
			const minFilter = that.texture_options.minFilter;
			if(extension == "gltf")
			{
				data = JSON.parse(data);
				files_data["main"] = this.filename;
			}
			else if(extension == "glb")
				files_data["main"] = this.filename;
			else if(extension == "bin")
				bins.push(this.filename);
			else if(extension == "jpeg" || extension == "jpg" || extension == "png" || extension == "webp")
			{
				if(typeof(gl) !== "undefined")
				{
					var image_url = URL.createObjectURL( new Blob([data],{ type : e.target.mimeType }) );
					var texture = GL.Texture.fromURL( image_url, { wrap: gl.REPEAT, extension: extension, magFilter, minFilter } );
					texture.name = this.filename;
					gl.textures[ texture.name ] = texture;
					//hack in case we drag textures individually
					if( gl.textures[ "/textures/" + texture.name ] )
						gl.textures[ "/textures/" + texture.name ] = texture;
				}
			}

			files_data[ this.filename ] = { 
				filename: this.filename,
				data: data,
				extension: this.extension
			};
			pending--;
			if(pending == 0)
			{
				files_data["binaries"] = bins;
				that.load( files_data, function(node) {
					if(callback)
						callback(node);
				});
			}
		}
	},

	//special case when using a data path
	removeRootPathFromTextures: function( materials, root_path, root )
	{
		if(!root_path)
			return;
		for(var i in materials)
		{
			var mat = materials[i];
			for(var j in mat.textures)
			{
				var sampler = mat.textures[j];
				if(!sampler)
					continue;
				if( sampler.constructor === String && sampler.indexOf( ROOM.root_path ) == 0 && sampler.texture.indexOf("/") != -1 )
				{
					sampler = { texture: sampler.substr( ROOM.root_path.length ) };
					continue;
				}
				if(!sampler.texture)
					continue;
				if( sampler.texture.indexOf( ROOM.root_path ) == 0 && sampler.texture.indexOf("/") != -1 )
					sampler.texture = sampler.texture.substr( ROOM.root_path.length );
			}
		}
	},

	encodeGLTF: function( scene, callback )
	{
		var GL = WebGL2RenderingContext;
		var binaries = [];
		var json = {
			accessors:[],
			asset: {
				generator: "RendeerJS",
				version: "2.0"
			},
			bufferViews: [],
			buffers:[{}],
			meshes: [],
			nodes: [],
			scene: 0,
			scenes: [ {nodes:[0]} ]
		};

		//prepare info
		var last_mesh_id = 0;
		var meshes = [];
		var last_material_id = 0;
		var materials = [];

		var allNodes = scene.root.getAllChildren([scene.root]);

		for(var i = 0; i < allNodes.length; ++i)
		{
			var node = allNodes[i];
			node._index_in_glb = i;
			var mesh = node.mesh ? this.meshes[ node.mesh ] : null;
			if(mesh && mesh._index_in_glb == null) {
				mesh._index_in_glb = last_mesh_id++;
				meshes[mesh._index_in_glb] = mesh;
				mesh._glb_attributes = {};
				mesh._glb_attributes["POSITION"] = addPrimitive("POSITION",mesh.vertexBuffers.vertices);
				if(mesh.vertexBuffers.normals)
				{
					for(var j = 0; j < mesh.vertexBuffers.normals.data.length; j+=3)
					{
						var N = mesh.vertexBuffers.normals.data.subarray(j,j+3); //GLB wants normalized normals
						vec3.normalize(N,N);
					}
					mesh._glb_attributes["NORMAL"] = addPrimitive("NORMAL",mesh.vertexBuffers.normals);
				}
				if(mesh.vertexBuffers.coords)
					mesh._glb_attributes["TEXCOORD_0"] = addPrimitive("TEXCOORD_0",mesh.vertexBuffers.coords);
				if(mesh.vertexBuffers.coords1)
					mesh._glb_attributes["TEXCOORD_1"] = addPrimitive("TEXCOORD_1",mesh.vertexBuffers.coords1);
				if(mesh.indexBuffers.triangles)
					mesh._glb_indices = addPrimitive("INDICES",mesh.indexBuffers.triangles);
				//for each group create indices
				if( mesh.indexBuffers.triangles && mesh.info && mesh.info.groups )
				{
					var triangles = mesh.indexBuffers.triangles;
					var glb_indices_group = [];
					for(var j = 0; j < mesh.info.groups.length; ++j)
					{
						var group = mesh.info.groups[j];
						var glb_indices = [];
						//get range
						var subindices = new triangles.data.constructor( triangles.data.subarray(group.start, group.start + group.length) );
						//make accessor from range
						var acc = addPrimitive("INDICES",subindices);
						glb_indices_group.push(acc);
					}
					mesh._glb_indices_group = glb_indices_group;
				}
			}

			if(node.material)
			{
				var material = RD.Materials[node.material];
				if(material && material._index_in_glb == null)
				{
					material._index_in_glb = last_material_id++;
					materials[material._index_in_glb] = material;
				}
			}
		}

		for(var i = 0; i < allNodes.length; ++i)
		{
			var node = allNodes[i];
			var json_node = {};
			if(node.name)
				json_node.name = node.name;
			if(node.mesh)
			{
				var node_material = RD.Materials[ node.material ];
				var mesh = this.meshes[node.mesh];
				if(mesh)
				{
					if(node.primitives && node.primitives.length)
					{
						var mesh_json = {
							primitives: []
						};
						for(var k = 0;k < node.primitives.length; ++k)
						{
							var prim = node.primitives[i];
							var prim_json = { 
								attributes: mesh._glb_attributes,
								mode: GL.TRIANGLES
							};
							var prim_material = RD.Materials[ prim.material ] || node_material;
							if( prim_material )
								prim_json.material = prim_material._index_in_glb;
							if( mesh._glb_indices_group[k] != null )
							{
								prim_json.indices = mesh._glb_indices_group[k];
							}
							mesh_json.primitives.push(prim_json);
						}
						var index = json.meshes.length;
						json.meshes.push( mesh_json );
						json_node.mesh = index;
					}
					else
					{
						var index = json.meshes.length;
						var prim_json = { 
							attributes: mesh._glb_attributes,
							mode: GL.TRIANGLES
						};
						if( node_material )
							prim_json.material = node_material._index_in_glb;
						var mesh_json = {
							primitives: [ prim_json ]
						};
						if( node.submesh != null && mesh._glb_indices_group )
						{
							prim_json.indices = mesh._glb_indices_group[ node.submesh ];
						}
						else if( mesh._glb_indices != null )
						{
							prim_json.indices = mesh._glb_indices;
						}
						json.meshes.push( mesh_json );
						json_node.mesh = index;
					}
				}
			}
			if(Object.keys(node.extras).length)
				json_node.extras = node.extras;
			if(node.children && node.children.length)
			{
				json_node.children = [];
				for(var j = 0; j < node.children.length; j++)
					json_node.children.push( node.children[j]._index_in_glb );
			}
			var identity = mat4.create(); //avoid identity matrices
			for(var j = 0; j < 16; ++j)
				if( node._local_matrix[j] != identity[j] )
				{
					json_node.matrix = typedArrayToArray( node._local_matrix );
					break;
				}
			json.nodes[i] = json_node;  
		}

		//store meshes
		//{ name:"", primitives: [ { mode:4, material: 0, indices:0, attributes:{ POSITION: 0, NORMAL: 1, TANGENT: 2, TEXCOORD_0: 3, TEXCOORD_1: 4} } ] }
	

		//store materials
		//{ name:"", pbrMetallicRoughness: { baseColorTexture: {index:0}, metallicRoughnessTexture:{}, metallicFactor:0, roughnessFactor: 0 } }
		if(materials.length)
		{
			json.materials = [];
			for(var i = 0; i < materials.length; i++)
			{
				var mat = materials[i];
				json.materials[i] = {
					alphaMode: "OPAQUE",
					doubleSided: mat.flags.two_sided,
					emissiveFactor:[0,0,0],
					pbrMetallicRoughness: {
						baseColorFactor: Array.from( mat.color )
					}
				}
			}	
		}

		//samplers
		//{ magFilter: gl.NEAREST, minFilter: ... }

		//scenes
		//[{ nodes:[0]}]

		//textures
		//{source:0, name:"", sampler: 0}

		//accessors
		//{bufferView:0, byteOffset:0, componentType:GL.FLOAT, count:n, max:, min:, type:"VEC3"}

		//bufferViews
		//{buffer:0, byteOffset:0, byteLength:0 }

		//buffers
		var size = 0, pos = 0;
		for(var i = 0; i < binaries.length; i++)
			size += binaries[i].byteLength;
		json.buffers[0].byteLength = size;
		var binBuffer = new Uint8Array(size);
		for(var i = 0; i < binaries.length; i++)
		{
			var bin = binaries[i];
			var u8Buffer = new Uint8Array(bin.buffer);
			binBuffer.set(u8Buffer,pos);
			var bufferView = {
				buffer: 0,
				byteOffset: pos,
				byteLength: u8Buffer.byteLength,
			};
			if( bin.constructor === Float32Array )
				bufferView.target = GL.ARRAY_BUFFER;
			else if( bin.constructor === Uint16Array || bin.constructor === Uint32Array )
				bufferView.target = GL.ELEMENT_ARRAY_BUFFER;
			json.bufferViews.push( bufferView );
			pos += u8Buffer.byteLength;
		}

		//pack json and bin to build GLB
		//console.log(json, binBuffer);

		function addPrimitive( name, prim_data )
		{
			var data = prim_data.data ? prim_data.data : prim_data;
			var count = data.length;
			var components = 1;
			var type = "SCALAR";
			var componentType = GL.FLOAT;
			if( data.constructor === Uint32Array)
			{
				componentType = GL.UNSIGNED_INT;
				type = "SCALAR";
			}
			else if( data.constructor === Uint16Array )
			{
				componentType = GL.UNSIGNED_SHORT;
				type = "SCALAR";
			}
			else if( name == "TEXCOORD_0" || name == "TEXCOORD_1" )
			{
				components = 2;
				type = "VEC2";
			}
			else 
			{
				components = 3;
				type = "VEC3";
			}
			count /= components;

			var min,max;
			min = Array.from(data.subarray(0,components));
			max = Array.from(data.subarray(0,components));
			for(var i = 0; i < data.length; i++)
			{
				min[i%components] = Math.min( data[i], min[i%components] );
				max[i%components] = Math.max( data[i], max[i%components] );
			}

			//create accessor
			var accessor = { bufferView: binaries.push(data) - 1, byteOffset: 0, componentType, count, type,max,min };
			return json.accessors.push(accessor) - 1;
		}

		//clear
		for(var i = 0; i < meshes.length; ++i)
		{
			delete meshes[i]._glb_indices;
			delete meshes[i]._index_in_glb;
			delete meshes[i]._glb_attributes;
		}
		for(var i = 0; i < allNodes.length; ++i)
		{
			delete allNodes[i]._index_in_glb;
		}

		return { json, binary: binBuffer };
	},

	encodeGLB: function( json, binary )
	{
		var json_str = JSON.stringify(json);
		var enc = new TextEncoder(); // always utf-8
		var json_bytes = enc.encode( json_str );
		var version = 2;
		var padded_json_size = Math.ceil( json_bytes.byteLength / 4 ) * 4;
		var padded_binary_size = Math.ceil( binary.byteLength / 4 ) * 4;

		var data = new Uint8Array( 12 + 8 + padded_json_size + 8 + padded_binary_size );

		//write header
		var endianess = true;
		var dv = new DataView( data.buffer );
		dv.setUint32(0,0x46546C67,endianess); //set magic
		dv.setUint32(4,version,endianess);
		dv.setUint32(8,data.byteLength, endianess);
		var byteOffset = 12;

		// console.log("JSON CHUNK START",byteOffset)
		dv.setUint32(byteOffset,padded_json_size, endianess); //chunk size
		dv.setUint32(byteOffset+4,RD.GLTF.JSON_CHUNK,endianess); //chunk type
		data.set(json_bytes,byteOffset+8); //chunk data
		for(var i = json_bytes.byteLength; i < padded_json_size; ++i)
			data[ byteOffset + 8 + i ] = 32; //add padding in the form of spaces
		byteOffset += 8 + padded_json_size;

		// console.log("BIN CHUNK START",byteOffset)
		dv.setUint32(byteOffset,padded_binary_size, endianess); //chunk size
		dv.setUint32(byteOffset+4,RD.GLTF.BINARY_CHUNK,endianess);
		data.set(binary,byteOffset+8);
		byteOffset += 8 + binary.byteLength;

		return data;
	}
};

RD.SceneNode.prototype.loadGLTF = function( url, callback, force )
{
	var that = this;

	if( RD.GLTF.prefabs[url] && !force)
	{
		var node = new RD.SceneNode();
		node.configure( RD.GLTF.prefabs[url] );
		inner( node );
		return;
	}

	this.loading = true;

	RD.GLTF.load( url, inner);

	function inner(node)
	{
		that.loading = false;
		node.updateGlobalMatrix(false,true); //updates all models
		if(node)
			that.addChild( node );
		if(callback)
			callback(that, node);
	}
}

function _base64ToArrayBuffer(base64) {
	////buffer.data = Uint8Array.from(atob(base64_string), c => c.charCodeAt(0)) ??
    var binary_string = window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

//load module
if(typeof(DracoDecoderModule) != "undefined")
	RD.GLTF.installDracoModule(RD.GLTF.onReady);
