// https://www.khronos.org/files/gltf20-reference-guide.pdf
RD.GLTF = {
	BYTE: 5120,
	UNSIGNED_BYTE: 5121,
	SHORT: 5122,
	UNSIGNED_SHORT: 5123,
	UNSIGNED_INT: 5125,
	FLOAT: 5126,

	JSON_CHUNK: 0x4E4F534A,
	BINARY_CHUNK: 0x004E4942,

	numComponents: { "SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT4":16 },

	rename_animation_properties: { "translation":"position","scale":"scaling" },

	flip_uv: true,

	prefabs: {},

	load: function( url, callback, extension )
	{
		var json = null;
		var folder = url.split("/");
		var filename = folder.pop();
		extension = extension || filename.split(".").pop().toLowerCase();
		folder = folder.join("/");

		console.log("loading gltf json...");
		fetch(url).then(function(response) {
			if( extension == "gltf" )
				return response.json();
			else
				return response.arrayBuffer();
		}).then(function(data){

			if( extension == "gltf" )
			{
				json = data;
				console.log("loading gltf binaries...");
				fetchBinaries( json.buffers.concat() );
			}
			else if( extension == "glb" )
			{
				json = RD.GLTF.parseGLB(data);
				if(!json)
					return;
				onFetchComplete();
			}
		});

		function fetchBinaries( list )
		{
			var buffer = list.pop();
			var bin_url = folder + "/" + buffer.uri;
			console.log(" - loading " + buffer.uri + " ...");
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
				if(data.byteLength != buffer.byteLength)
					console.warn("gltf binary doesnt match json size hint");
				if(list.length)
					fetchBinaries( list );
				else
					onFetchComplete();
			}
		}

		function onFetchComplete()
		{
			console.log("parsing gltf ...");
			json.filename = filename;
			json.folder = folder;
			json.url = url;
			var node = RD.GLTF.parse( json );
			RD.GLTF.prefabs[ url ] = node.serialize();
			if(callback)
				callback(node);
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
				if (!("TextDecoder" in window))
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
				if(data.byteLength != buffer.byteLength)
					console.warn("gltf binary doesnt match json size hint");
				chunk_index++;
			}
			else
				console.warn("gltf unknown chunk type: ", "0x"+chunk_type.toString(16));
		}

		return json;
	},

	parse: function(json)
	{
		console.log(json);

		var root = null;
		var nodes_by_id = {};
		if( json.scenes.length > 1 )
			console.warn("gltf importer only supports one scene per file, skipping the rest");

		var nodes_info = json.scenes[ json.scene ].nodes;

		var root = null;
		if(nodes_info.length > 1) //multiple root nodes
		{
			root = new RD.SceneNode();
			root.name = "root";
		}

		for(var i = 0; i < nodes_info.length; ++i)
		{
			var info = nodes_info[i];
			if(info.node)
				continue;
			var node = RD.GLTF.parseNode( null, i, json );
			if(!root)
				root = node;
			if(nodes_info.length > 1)
				root.addChild( node );
			node.id = json.url.replace(/\//gi,"_") + "::node_" + i;
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
					if(animation)
					{
						RD.Animations[ animation.name ] = animation;
						root.animations.push(animation);
					}
				}
			}
		}

		return root;
	},

	parseNode: function(node, index, json)
	{
		var info = json.nodes[ index ];

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
				case "scale": node.scaling = v; break;
				case "matrix": 
					node.fromMatrix( v );
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
							var material = this.parseMaterial( group.material, json );
							node.primitives.push({
								index: j, 
								material: material.name,
								mode: group.mode
							});
						}
					}
					break;
				case "skin":
					node.skin = this.parseSkin( v, json );
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
				default:
					console.log("feature skipped",j);
					break;
			}
		}

		if(!info.name)
			info.name = node.name = "node_" + index;

		return node;
	},

	parseMesh: function(index, json)
	{
		var mesh_info = json.meshes[index];
		var meshes_container = gl.meshes;

		//extract primitives
		var meshes = [];
		for(var i = 0; i < mesh_info.primitives.length; ++i)
		{
			var prim = this.parsePrimitive( mesh_info, i, json );
			var mesh_primitive = { vertexBuffers: {}, indexBuffers:{} };
			for(var j in prim.buffers)
				if( j == "indices" || j == "triangles" )
					mesh_primitive.indexBuffers[j] = { data: prim.buffers[j] };
				else
					mesh_primitive.vertexBuffers[j] = { data: prim.buffers[j] };
			meshes.push({ mesh: mesh_primitive });
		}

		//merge primitives
		var mesh = null;
		if(meshes.length > 1)
			mesh = GL.Mesh.mergeMeshes( meshes );
		else
			mesh = new GL.Mesh( meshes[0].mesh.vertexBuffers, meshes[0].mesh.indexBuffers );

		for(var i = 0; i < mesh_info.primitives.length; ++i)
		{
			var g = mesh.info.groups[i];
			if(!g)
				mesh.info.groups[i] = g = {};
			g.material = mesh_info.primitives[i].material;
			g.mode = mesh_info.primitives[i].mode;
		}

		mesh.name = mesh_info.name || "mesh_" + index;
		//mesh.material = primitive.material;
		//mesh.primitive = mesh_info.mode;
		meshes_container[ mesh.name ] = mesh;
		return mesh;
	},

	parsePrimitive: function( mesh_info, index, json )
	{
		var primitive = {
			buffers: {}
		};
		var buffers = primitive.buffers;

		var primitive_info = mesh_info.primitives[ index ];

		if(!primitive_info.attributes.POSITION == null)
			console.warn("gltf mesh without positions");
		else
			buffers.vertices = this.parseAccessor( primitive_info.attributes.POSITION, json );
		if(primitive_info.attributes.NORMAL != null)
			buffers.normals = this.parseAccessor( primitive_info.attributes.NORMAL, json );
		if(primitive_info.attributes.TEXCOORD_0 != null)
			buffers.coords = this.parseAccessor( primitive_info.attributes.TEXCOORD_0, json, this.flip_uv );
		if(primitive_info.attributes.TEXCOORD_1 != null)
			buffers.coords1 = this.parseAccessor( primitive_info.attributes.TEXCOORD_1, json, this.flip_uv );
		//skinning
		if(primitive_info.attributes.WEIGHTS_0 != null)
			buffers.weights = this.parseAccessor( primitive_info.attributes.WEIGHTS_0, json );
		if(primitive_info.attributes.JOINTS_0 != null)
			buffers.bones = this.parseAccessor( primitive_info.attributes.JOINTS_0, json );

		//indices
		if(primitive_info.indices != null)
			buffers.triangles = this.parseAccessor( primitive_info.indices, json );

		primitive.mode = primitive_info.mode;
		primitive.material = primitive_info.material;
		return primitive;
	},

	parseAccessor: function(index, json, flip_y)
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
		switch( accessor.componentType )
		{
			case RD.GLTF.FLOAT: databuffer = new Float32Array( size ); break;
			case RD.GLTF.UNSIGNED_INT: databuffer = new Uint32Array( size ); break;
			case RD.GLTF.SHORT: databuffer = new Int16Array( size );  break;
			case RD.GLTF.UNSIGNED_SHORT: databuffer = new Uint16Array( size );  break;
			case RD.GLTF.BYTE: databuffer = new Int8Array( size );  break;
			case RD.GLTF.UNSIGNED_BYTE: databuffer = new Uint8Array( size );  break;
			default:
				console.warn("gltf accessor of unsupported type: ", accessor.componentType);
				databuffer = new Float32Array( size );
		}

		var bufferView = json.bufferViews[ accessor.bufferView ];
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

		if(bufferView.byteStride && bufferView.byteStride != components * databuffer.BYTES_PER_ELEMENT)
		{
			console.warn("gltf buffer data is not tightly packed, not supported");
			return null;
		}

		var databufferview = new Uint8Array( databuffer.buffer );

		if(bufferView.byteOffset == null)//could happend when is 0
			bufferView.byteOffset = 0;

		//extract chunk from binary (not using the size from the bufferView because sometimes it doesnt match!)
		var start = bufferView.byteOffset + (accessor.byteOffset || 0);
		var chunk = buffer.dataview.subarray( start, start + databufferview.length );

		//copy data to buffer
		databufferview.set( chunk );

		if(flip_y)
			for(var i = 1; i < databuffer.length; i += components )
				databuffer[i] = 1.0 - databuffer[i]; 

		return databuffer;
	},

	parseMaterial: function( index, json )
	{
		var info = json.materials[index];
		if(!info)
		{
			console.warn("gltf material not found");
			return null;
		}

		var material = RD.Materials[ info.name ];
		if(material)
			return material;

		material = new RD.Material();
		material.name = info.name;
		//material.shader_name = "phong";

		if(info.alphaMode != null)
			material.blendMode = info.alphaMode;
		if(info.alphaCutoff != null)
			material.alphaCutoff = info.alphaCutoff;
		if(info.doubleSided != null)
			material.doubleSided = info.doubleSided;

		if(info.pbrMetallicRoughness)
		{
			material.model = "pbrMetallicRoughness";
			if(info.pbrMetallicRoughness.baseColorFactor != null)
				material.color = info.pbrMetallicRoughness.baseColorFactor;
			if(info.pbrMetallicRoughness.metallicFactor != null)
				material.metallicFactor = info.pbrMetallicRoughness.metallicFactor;
			if(info.pbrMetallicRoughness.roughnessFactor != null)
				material.roughnessFactor = info.pbrMetallicRoughness.roughnessFactor;
			if(info.pbrMetallicRoughness.baseColorTexture)
				material.textures.color = this.parseTexture( info.pbrMetallicRoughness.baseColorTexture.index, json );
			if(info.pbrMetallicRoughness.metallicRoughnessTexture)
				material.textures.metallicRoughness = this.parseTexture( info.pbrMetallicRoughness.metallicRoughnessTexture.index, json );
		}

		if(info.occlusionTexture)
			material.textures.occlusion = this.parseTexture( info.occlusionTexture.index, json );
		if(info.normalTexture)
			material.textures.normalmap = this.parseTexture( info.normalTexture.index, json );
		if(info.emissiveTexture)
			material.textures.emissive = this.parseTexture( info.emissiveTexture.index, json );
		if(info.emissiveFactor)
			material.emissive = info.emissiveFactor;

		RD.Materials[ material.name ] = material;
		return material;
	},

	parseTexture: function( index, json )
	{
		var info = json.textures[index];
		if(!info)
		{
			console.warn("gltf texture not found");
			return null;
		}

		var source = json.images[ info.source ];
		var image_name = json.url.replace(/[\/\.\:]/gi,"_") + "_image_" + index;// + ".png";
		image_name += "." + (source.mimeType.split("/").pop());
		var image = RD.Images[ image_name ];
		if( image )
			return image;

		var image_data = {};

		if(source.uri) //external image file
		{
			var filename = source.uri;
			image_data.filename = json.folder + "/" + filename;
		}
		else if(source.bufferView != null) //embeded image file
		{
			var bufferView = json.bufferViews[ source.bufferView ];
			if(bufferView.byteOffset == null)
				bufferView.byteOffset = 0;
			var buffer = json.buffers[ bufferView.buffer ];
			var image_bytes = buffer.data.slice( bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength );

			var image_url = URL.createObjectURL( new Blob([image_bytes],{ type : source.mimeType }) );
			var texture = GL.Texture.fromURL( image_url );
			texture.name = image_name;
			gl.textures[ image_name ] = texture;
		}

		if(info.sampler)
		{
			var sampler = json.samplers[ info.sampler ];
			image_data.magFilter = sampler.magFilter;
			image_data.minFilter = sampler.minFilter;
		}

		//return image_data;
		return image_name;
	},

	parseSkin: function( index, json )
	{
		var info = json.skins[ index ];
		var skin = {};
		skin.skeleton_root = json.nodes[ info.skeleton ].name;
		skin.bindMatrices = this.splitBuffer( this.parseAccessor( info.inverseBindMatrices, json ), 16 );
		skin.joints = [];
		for(var i = 0; i < info.joints.length; ++i)
		{
			var joint = json.nodes[ info.joints[i] ];
			skin.joints.push( joint.id );
		}
		return skin;
	},

	splitBuffer: function( buffer, length )
	{
		var l = buffer.length;
		var result = [];
		for(var i = 0; i < l; i+= length)
			result.push( new buffer.constructor( buffer.subarray(i,i+length) ) );
		return result;
	},

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
			var type = json.accessors[ sampler.output ].type;
			var type_enum = RD.TYPES[type];
			if( type_enum == RD.VEC4 && track.target_property == "rotation")
				type_enum = RD.QUAT;
			track.type = type_enum;
			var num_components = RD.TYPES_SIZE[ type_enum ];

			if(!num_components)
			{
				console.warn("gltf unknown type:",type);
				continue;
			}
			var num_elements = keyframedata.length / num_components;
			var keyframes = new Float32Array( (1+num_components) * num_elements );
			for(var j = 0; j < num_elements; ++j)
			{
				keyframes[j*(1+num_components)] = timestamps[j];
				var value = keyframedata.subarray(j,j+num_components);
				if(type_enum == RD.QUAT)
					quat.identity(value,value);
				keyframes.set( value, j*(1+num_components)+1 );
			}
			track.data = keyframes;
			track.packed_data = true;
			duration = Math.max( duration, timestamps[ timestamps.length - 1] );

			animation.addTrack( track );
		}

		animation.duration = duration;

		return animation;
	},

	loadFromFiles: function(files,callback)
	{
		//search for .GLTF
		//...
		var file = files[0];
		var url = URL.createObjectURL( file );
		var t = file.name.split(".");
		var extension = t[ t.length - 1 ].toLowerCase();
		this.load(url,function(node){
			if(callback)
				callback(node);
		},extension);
	}
};

function _base64ToArrayBuffer(base64) {
    var binary_string = window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}