(function(global){
var RD = global.RD;

//Adds a pipeline to render in PBR
//It supports rendering in deferred mode or forward mode
function PBRPipeline( renderer )
{
	this.renderer = renderer;
	this.mode = PBRPipeline.FORWARD;
	this.fbo = null;
	this.visible_layers = 0xFF;
	this.bgcolor = vec4.fromValues(0.1,0.1,0.1,1.0);
	this.environment_texture = null;
	this.render_skybox = true;
	this.skybox_texture = null; //in case is different from the environment texture
	this.environment_sh_coeffs = null;
	this.environment_rotation = 180;
	this.environment_factor = 1;
	this.exposure = 1;
	this.occlusion_factor = 1;
	this.emissive_factor = 1.0; //to boost emissive

	this.contrast = 1.0;
	this.brightness = 1.0;

	this.parallax_reflection = false;
	this.parallax_reflection_matrix = mat4.create();
	this.parallax_reflection_matrix_inv = mat4.create();

	this.resolution_factor = 1;
	this.quality = 1;
	this.test_visibility = true;
	this.single_pass = false;

	this.use_rendertexture = true;
	this.fx = null;

	//this.overwrite_shader_name = "normal";

	this.global_uniforms = {
		u_brdf_texture: 0,
		u_exposure: this.exposure,
		u_occlusion_factor: this.occlusion_factor,
		u_background_color: this.bgcolor.subarray(0,3),
		u_tonemapper: 0,
		u_SpecularEnvSampler_texture: 1,
		u_skybox_mipCount: 5,
		u_skybox_info: [ this.environment_rotation, this.environment_factor ],
		u_use_environment_texture: false,
		u_clipping_plane: vec4.fromValues(0,0,0,0)
    };

	this.material_uniforms = {
		u_albedo: vec3.fromValues(1,1,1),
		u_emissive: vec3.fromValues(0,0,0),
		u_roughness: 1,
		u_metalness: 1,
		u_alpha: 1.0,
		u_alpha_cutoff: 0.0,
		u_tintColor: vec3.fromValues(1,1,1),
		u_normalFactor: 1,
		u_metallicRough: false, //use metallic rough texture
		u_reflectance: 0.1, //multiplied by the reflectance function

		u_maps_info: new Int8Array(8), //info about channels

		u_clearCoat: 0.0,
		u_clearCoatRoughness: 0.5,
	
		u_isAnisotropic: false,
		u_anisotropy: 0.5,
		u_anisotropy_direction: vec3.fromValues(0,0,1.0)
	};

	this.sampler_uniforms = {};

	this.material_uniforms.u_maps_info.fill(-1);

	this.fx_uniforms = {
		u_viewportSize: vec2.create(),
		u_iViewportSize: vec2.create()
	};

	this.final_texture = null; //HDR image that contains the final scene before tonemapper
	this.final_fbo = null;

	this.render_calls = [];
	this.num_render_calls = 0;
	this.last_num_render_calls = 0;

	this.compiled_shaders = {};//new Map();

	this.max_textures = gl.getParameter( gl.MAX_TEXTURE_IMAGE_UNITS );
	this.max_texture_size = gl.getParameter( gl.MAX_TEXTURE_SIZE );

	this.default_material = new RD.Material();
}

PBRPipeline.FORWARD = 1;
PBRPipeline.DEFERRED = 2;

PBRPipeline.MACROS = {
	UVS2: 1,	
	COLOR: 1<<1,
	PARALLAX_REFLECTION: 1<<2
};

PBRPipeline.maps = ["albedo","metallicRoughness","occlusion","normal","emissive","opacity","displacement"];

PBRPipeline.prototype.render = function( renderer, nodes, camera, scene, skip_fbo, layers )
{
	this.renderer = renderer;

	if(this.mode == PBRPipeline.FORWARD)
		this.renderForward( nodes, camera, skip_fbo, layers );
	else if(this.mode == PBRPipeline.DEFERRED)
		this.renderDeferred( nodes, camera, layers );

	var brdf_tex = this.getBRDFIntegratorTexture();
	if(brdf_tex && 0) //debug
	{
		gl.viewport(0,0,256,256);
		brdf_tex.toViewport();
		gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
	}
}

//gathers uniforms that do not change between rendered objects
PBRPipeline.prototype.fillGlobalUniforms = function()
{
	var brdf_tex = this.getBRDFIntegratorTexture();
	if(brdf_tex)
		brdf_tex.bind( 0 );
	if(this.environment_texture)
	{
		this.environment_texture.bind(1);
		this.global_uniforms.u_use_environment_texture = true;
	}
	else
		this.global_uniforms.u_use_environment_texture = false;

	if( this.environment_sh_coeffs )
	{
		this.global_uniforms.u_useDiffuseSH = true;
		this.global_uniforms.u_sh_coeffs = this.environment_sh_coeffs;
	}
	else
		this.global_uniforms.u_useDiffuseSH = false;
	this.global_uniforms.u_skybox_info[0] = this.environment_rotation * DEG2RAD;
	this.global_uniforms.u_skybox_info[1] = this.environment_factor;
	this.global_uniforms.u_exposure = this.exposure;
	this.global_uniforms.u_occlusion_factor = this.occlusion_factor;
	this.global_uniforms.u_background_color = this.bgcolor.subarray(0,3);
}

PBRPipeline.prototype.renderForward = function( nodes, camera, skip_fbo, layers )
{
	//prepare buffers
	var w = Math.floor( gl.viewport_data[2] * this.resolution_factor );
	var h = Math.floor( gl.viewport_data[3] * this.resolution_factor );

	//avoid creating textures too big
	w = Math.min( w, this.max_texture_size );
	h = Math.min( h, this.max_texture_size );

	//set up render buffer in case we want to apply postFX
	if(this.use_rendertexture && !skip_fbo)
	{
		if(!this.final_texture || this.final_texture.width != w || this.final_texture.height != h )
		{
			this.final_texture = new GL.Texture( w,h, { format: gl.RGBA, type: gl.HIGH_PRECISION_FORMAT } );
			if(!this.final_fbo)
				this.final_fbo = new GL.FBO( [this.final_texture] );
			else
				this.final_fbo.setTextures( [this.final_texture] );
		}

		this.final_fbo.bind(0);
	}

	//prepare render
	gl.clearColor( this.bgcolor[0], this.bgcolor[1], this.bgcolor[2], this.bgcolor[3] );
	gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

	//set default 
	gl.frontFace( gl.CCW );
	gl.enable( gl.DEPTH_TEST );
	gl.disable( gl.BLEND );

	//render skybox
	this.renderSkybox(camera);

	this.fillGlobalUniforms();

	if(this.onRenderOpaque)
		this.onRenderOpaque( this, renderer, camera );

	//clears render calls list
	this.resetRenderCallsPool();	

	//extract render calls from scene nodes
	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		this.getNodeRenderCalls( node, camera, layers );
	}

	//sort by alpha and distance
	var rcs = this.render_calls.slice(0,this.num_render_calls);
	for(var i = 0; i < rcs.length; ++i)
		rcs[i].computeRenderPriority( camera._position );
	rcs = rcs.sort( PBRPipeline.rc_sort_function );

	//group by instancing?
	//TODO
	//this.groupRenderCallsForInstancing();

	//do the render call for every rcs
	for(var i = 0; i < rcs.length; ++i)
	{
		var rc = rcs[i];
		this.renderMeshWithMaterial( rc.model, rc.mesh, rc.material, rc.index_buffer_name, rc.group_index, rc.node.extra_uniforms, rc.reverse_faces );
	}

	//some useful callbacks
	if(this.onRenderAlpha)
		this.onRenderAlpha( this, this.renderer, camera );

	if(this.onRenderGizmos)
		this.onRenderGizmos( this, this.renderer, camera );

	//if not rendering to viewport, now we must render the buffer to the viewport
	if(this.use_rendertexture && !skip_fbo)
		this.renderFinalBuffer();
}

PBRPipeline.prototype.renderFinalBuffer = function()
{
	this.final_fbo.unbind(0);

	gl.disable( GL.BLEND );
	gl.disable( GL.DEPTH_TEST );

	if(this.fx)
		this.fx.applyFX( this.final_texture, this.final_texture );

	this.fx_uniforms.u_viewportSize[0] = this.final_texture.width;
	this.fx_uniforms.u_viewportSize[1] = this.final_texture.height;
	this.fx_uniforms.u_iViewportSize[0] = 1/this.final_texture.width;
	this.fx_uniforms.u_iViewportSize[1] = 1/this.final_texture.height;

	this.fx_uniforms.u_contrast = this.contrast;
	this.fx_uniforms.u_brightness = this.brightness;

	this.final_texture.toViewport( gl.shaders["tonemapper"], this.fx_uniforms );
}


PBRPipeline.prototype.getNodeRenderCalls = function( node, camera, layers )
{
	//get mesh
	var mesh = null;
	if (node._mesh) //hardcoded mesh
		mesh = node._mesh;
	else if (node.mesh) //shared mesh
	{
		mesh = gl.meshes[ node.mesh ];
		if(!mesh)
			return;
	}

	if(layers === undefined)
		layers = 0xFF;

	//prepare matrix (must be done always or children wont have the right transform)
	node.updateGlobalMatrix(true);

	if(!mesh)
		return;

	if(node.flags.visible === false || !(node.layers & layers) )
		return;

	//check if inside frustum
	if(this.test_visibility)
	{
		if(!PBRPipeline.temp_bbox)
		{
			PBRPipeline.temp_bbox = BBox.create();
			PBRPipeline.aabb_center = BBox.getCenter( PBRPipeline.temp_bbox );
			PBRPipeline.aabb_halfsize = BBox.getHalfsize( PBRPipeline.temp_bbox );
		}
		var aabb = PBRPipeline.temp_bbox;
		BBox.transformMat4( aabb, mesh.getBoundingBox(), node._global_matrix );
		if ( camera.testBox( PBRPipeline.aabb_center, PBRPipeline.aabb_halfsize ) == RD.CLIP_OUTSIDE )
			return;

		node._last_rendered_frame = this.renderer.frame; //mark last visible frame
	}

	//it has multiple submaterials
	if( node.primitives && node.primitives.length )
	{
		for(var i = 0; i < node.primitives.length; ++i)
		{
			var prim = node.primitives[i];
			var material = null;
			if(!prim.material)
				material = this.default_material;
			else
				material = RD.Materials[ prim.material ];
			if(!material)
				continue;

			var rc = this.getRenderCallFromPool();
			rc.material = material;
			rc.model = node._global_matrix;
			rc.mesh = mesh;
			rc.group_index = i;
			rc.node = node;
			rc._render_priority = material.render_priority || 0;
			rc.reverse_faces = node.flags.frontFace == GL.CW;
		}
		return;
	}

	if(node.material)
	{
		var material = RD.Materials[ node.material ];
		if(material)
		{
			var rc = this.getRenderCallFromPool();
			rc.material = material;
			rc.model = node._global_matrix;
			rc.mesh = mesh;
			rc.group_index = -1;
			rc.node = node;
			rc._render_priority = material.render_priority || 0;
			rc.reverse_faces = node.flags.frontFace == GL.CW;
		}
	}
}

PBRPipeline.prototype.groupRenderCallsForInstancing = function()
{
	var groups = {};

	for(var i = 0; i < this.num_render_calls; ++i)
	{
		var rc = this.render_calls[i];
		var key = rc.mesh.name + ":" + rc.group_index + "/" + rc.material.name + (rc.reverse_faces ? "[R]" : "");
		if(!groups[key])
			groups[key] = [rc];
		else
		{
			groups[key].push(rc);
			//console.log("shared!",key);
		}
	}

	for(var i in groups)
		if( groups[i].length > 1 )
			console.log( i, groups[i].length );

}

//places semitransparent meshes the last ones
PBRPipeline.rc_sort_function = function(a,b)
{
	return b._render_priority - a._render_priority;
}

PBRPipeline.prototype.setParallaxReflectionTransform = function( transform )
{
	this.parallax_reflection_matrix.set( transform );
	this.parallax_reflection = true;
	this.global_uniforms.u_cube_reflection_matrix = this.parallax_reflection_matrix;
	mat4.invert( this.parallax_reflection_matrix_inv, this.parallax_reflection_matrix );
	this.global_uniforms.u_inv_cube_reflection_matrix = this.parallax_reflection_matrix_inv;
}

PBRPipeline.prototype.getShader = function( macros, fragment_shader_name )
{
	var container = this.compiled_shaders[fragment_shader_name];
	if(!container)
		container = this.compiled_shaders[fragment_shader_name] = new Map();

	var shader = container.get( macros );
	if(shader)
		return shader;

	if(!this.renderer.shader_files)
		return null;

	var vs = this.renderer.shader_files[ "default.vs" ];
	var fs = this.renderer.shader_files[ fragment_shader_name ];

	var macros_info = null;
	if( macros )
	{
		macros_info = {};
		for( var i in PBRPipeline.MACROS )
		{
			var flag = PBRPipeline.MACROS[i];
			if( macros & flag )
				macros_info[ i ] = "";
		}
	}

	var shader = new GL.Shader( vs, fs, macros_info );
	container.set(macros,shader);
	return shader;
}

PBRPipeline.prototype.renderMeshWithMaterial = function( model, mesh, material, index_buffer_name, group_index, extra_uniforms, reverse_faces )
{
	var renderer = this.renderer;

	var shader = null;

	//not visible
	if(material.alphaMode == "BLEND" && material.color[3] <= 0.0)
		return;

	var material_uniforms = this.material_uniforms;
	var sampler_uniforms = this.sampler_uniforms;

	//materials
	material_uniforms.u_albedo = material.color.subarray(0,3);
	material_uniforms.u_emissive.set( material.emissive || RD.ZERO );
	if(this.emissive_factor != 1.0)
		vec3.scale( material_uniforms.u_emissive, material_uniforms.u_emissive, this.emissive_factor );

	var shader = null;

	var macros = 0;
	if(mesh.vertexBuffers.coords1)
		macros |= PBRPipeline.MACROS.UVS2;
	if(mesh.vertexBuffers.colors)
		macros |= PBRPipeline.MACROS.COLOR;

	if( this.parallax_reflection )
		macros |= PBRPipeline.MACROS.PARALLAX_REFLECTION;

	if( this.overwrite_shader_name )
	{
		shader = gl.shaders[ this.overwrite_shader_name ];
	}
	else if( material.model == "pbrMetallicRoughness" && this.quality )
	{
		material_uniforms.u_metalness = material.metallicFactor;
		material_uniforms.u_roughness = material.roughnessFactor;
		material_uniforms.u_metallicRough = Boolean( material.textures["metallicRoughness"] );
		shader = this.getShader( macros, "pbr.fs" );
	}
	else
	{
		shader = this.getShader( macros, "nopbr.fs" );
	}

	if(!shader)
		return;

	material_uniforms.u_alpha = material.opacity;
	material_uniforms.u_alpha_cutoff = -1; //disabled

	material_uniforms.u_normalFactor = material.normalmapFactor != null ? material.normalmapFactor : 1.0;

	//textures
	var slot = 2; //skip 0 and 1 as are in use
	var maps_info = material_uniforms.u_maps_info;
	for(var i = 0; i < PBRPipeline.maps.length; ++i)
	{
		var map = PBRPipeline.maps[i];
		maps_info[i] = -1;
		var texture_info = material.textures[ map ];
		if(!texture_info)
			continue;

		var texture_name = null;
		if( texture_info.constructor === Object ) //in case it has properties for this channel
			texture_name = texture_info.texture;
		else if( texture_info.constructor === String ) 
		{
			texture_name = texture_info;
			texture_info = null;
		}
		if(!texture_name)
			continue;

		var texture_uniform_name = "u_" + map + "_texture";

		if( shader && !shader.samplers[ texture_uniform_name ]) //texture not used in shader
			continue; //do not bind it

		var texture = gl.textures[ texture_name ];
		if(!texture)
		{
			if(renderer.autoload_assets && texture_name.indexOf(".") != -1)
				renderer.loadTexture( texture_name, renderer.default_texture_settings );
			texture = gl.textures[ "white" ];
		}

		var tex_slot = this.max_textures < 16 ? slot++ : i + 2;
		sampler_uniforms[ texture_uniform_name ] = texture.bind( tex_slot );
		if( texture_info && texture_info.uv_channel == 1 )
			maps_info[i] = 1;
		else
			maps_info[i] = 0;
	}

	//flags
	if( !reverse_faces )
		gl.frontFace( GL.CCW );
	renderer.enableItemFlags( material );
	if( reverse_faces )
		gl.frontFace( GL.CW );

	if(material.alphaMode == "BLEND")
	{
		gl.enable(gl.BLEND);
		if(material.additive)
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE );
		else
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.depthMask( false );
	}
	else if(material.alphaMode == "MASK")
	{
		material_uniforms.u_alpha_cutoff = material.alphaCutoff;
	}
	else
		gl.disable(gl.BLEND);

	renderer._uniforms.u_model.set( model );
	shader.uniforms( renderer._uniforms ); //globals
	shader.uniforms( this.global_uniforms ); 
	shader.uniforms( material_uniforms ); //locals
	shader.uniforms( sampler_uniforms ); //locals
	if(extra_uniforms)
		shader.uniforms( extra_uniforms );

	var group = null;
	if( group_index != null && mesh.info && mesh.info.groups && mesh.info.groups[ group_index ] )
		group = mesh.info.groups[ group_index ];

	//hack to render alpha objects first in the depth buffer, and then again (used in very specific cases)
	if(material.flags.preAlpha)
	{
		gl.colorMask(false,false,false,false);
		gl.depthMask( true );
		if(group)
			shader.drawRange( mesh, material.primitive, group.start, group.length, index_buffer_name );
		else
			shader.draw( mesh, material.primitive, index_buffer_name );
		gl.colorMask(true,true,true,true);
		gl.depthFunc( gl.LEQUAL );
	}

	if(group)
		shader.drawRange( mesh, material.primitive, group.start, group.length, index_buffer_name );
	else
		shader.draw( mesh, material.primitive, index_buffer_name );

	renderer.disableItemFlags( material );
	if( reverse_faces )
		gl.frontFace( GL.CCW );

	gl.depthFunc( gl.LESS );
	gl.depthMask( true );
}

PBRPipeline.prototype.renderDeferred = function( scene, camera )
{
	//TODO
}

PBRPipeline.prototype.prepareBuffers = function( camera )
{
	var w = gl.drawingBufferWidth;
	var h = gl.drawingBufferHeight;
}

PBRPipeline.prototype.renderToGBuffers = function( scene, camera )
{
	
}

PBRPipeline.prototype.renderFinalPass = function( scene, camera )
{

}

PBRPipeline.prototype.applyPostFX = function()
{
	
}

PBRPipeline.prototype.getRenderCallFromPool = function()
{
	if( this.num_render_calls < this.render_calls.length )
	{
		var rc = this.render_calls[this.num_render_calls];
		this.num_render_calls++;
		return rc;
	}

	var rc = new RD.RenderCall();
	rc.id = this.num_render_calls;
	this.render_calls.push( rc );
	this.num_render_calls++;
	return rc;
}

PBRPipeline.prototype.resetRenderCallsPool = function()
{
	this.last_num_render_calls = this.num_render_calls;
	this.num_render_calls = 0;
}

PBRPipeline.prototype.renderSkybox = function( camera )
{
	//allows to overwrite the skybox rendering
	if( this.onRenderSkybox )
	{
		if( this.onRenderSkybox( this, camera ) )
			return;
	}

	if(!this.environment_texture || !this.render_skybox)
		return;

	//render the environment
	var mesh = gl.meshes["cube"];
	var shader = gl.shaders[ this.overwrite_shader_name || "skybox" ];
	if(!shader)
		return;
	var texture = this.skybox_texture || this.environment_texture;
	if(!texture)
		return;

	gl.disable( gl.CULL_FACE );
	gl.disable( gl.DEPTH_TEST );
	gl.disable( gl.BLEND );
	var model = this.renderer._model_matrix;
	mat4.identity( model );
	mat4.translate( model, model, camera.position );
	mat4.scale( model, model, [10,10,10] );
	this.renderer.setModelMatrix(model);
	shader.uniforms( this.renderer._uniforms );
	shader.uniforms({
		u_color_texture: texture.bind(0),
		u_is_rgbe: false,
		u_exposure: this.exposure,
		u_mipmap_offset: 0,
		u_rotation: this.environment_rotation * DEG2RAD,
		u_camera_position: camera.position
	});
	shader.draw(mesh,GL.TRIANGLES);
}

PBRPipeline.prototype.loadEnvironment = function( url, callback, is_skybox )
{
	var that = this;
	var tex = gl.textures[url];
	if(tex)
	{
		if(is_skybox)
			that.skybox_texture = tex;
		else
		{
			if(tex.shs)
				that.environment_sh_coeffs = tex.shs;
			that.environment_texture = tex;
		}
		if(callback)
			callback(tex);
		return;
	}

	HDRE.load(url, function(data){
		var tex = data.toTexture(true);
		if(tex)
		{
			gl.textures[url] = tex;
			if(is_skybox)
				that.skybox_texture = tex;
			else
			{
				tex.shs = data.shs ? data.shs : null;
				that.environment_texture = tex;
				if(tex.shs)
					that.environment_sh_coeffs = tex.shs;
			}
		}
		if(callback)
			callback(tex);
	});
}

PBRPipeline.prototype.captureEnvironment = function( scene, position, size )
{
	size = size || 256;

	//create secondary to avoid feedback
	if(!this.capture_environment_texture)
		this.capture_environment_texture = new GL.Texture(size,size,{
            format: gl.RGBA,
            type: GL.UNSIGNED_BYTE,
            minFilter: gl.LINEAR_MIPMAP_LINEAR,
            texture_type: GL.TEXTURE_CUBE_MAP
        });

	//disable postfx shader
	var tmp = this.use_rendertexture;
	this.use_rendertexture = false;

	//render six sides
	this.renderer.renderToCubemap( this.capture_environment_texture, scene, position );
	this.use_rendertexture = tmp;

	//generate mipmaps
	this.capture_environment_texture.bind(0);
	gl.generateMipmap( this.capture_environment_texture.texture_type );

	//create final environment
	if(!this.environment_texture)
	{
		this.environment_texture = new GL.Texture(size,size,{
            format: gl.RGBA,
            type: GL.UNSIGNED_BYTE,
            minFilter: gl.LINEAR_MIPMAP_LINEAR,
            texture_type: GL.TEXTURE_CUBE_MAP
        });
	}

	//copy secondary to final
	this.capture_environment_texture.copyTo( this.environment_texture );

	//TODO
	//apply blurring to mipmaps
}

//path to brdf_integrator.bin or generate on the fly
PBRPipeline.prototype.getBRDFIntegratorTexture = function(path_to_bin)
{
	var tex_name = 'brdf_integrator';

	if(gl.textures[tex_name])
		return gl.textures[tex_name];

	var shader = gl.shaders["brdf_integrator"];
	if(!shader)
	{
		//console.warn("brdf_integrator shader not found");
		return;
	}

	var options = { type: gl.FLOAT, texture_type: gl.TEXTURE_2D, filter: gl.LINEAR};
	var tex = gl.textures[tex_name] = new GL.Texture(128, 128, options);

	//fetch from precomputed one
	if(path_to_bin)
	{
		fetch( path_to_bin ).then(function(response) {
					return response.arrayBuffer();
				}).then(function(data){
					tex.uploadData( new Float32Array( data ), { no_flip:true });
				});
		return tex;
	}
	
	var hammersley_tex = gl.textures["hammersley_sample_texture"];
	if(!hammersley_tex)
		hammersley_tex = this.createHammersleySampleTexture();

	tex.drawTo(function(texture) {
		if(hammersley_tex)
			hammersley_tex.bind(0);
		shader.uniforms({		
			u_hammersley_sample_texture: 0
		}).draw( GL.Mesh.getScreenQuad(), gl.TRIANGLES );
	});

	return tex;
}

PBRPipeline.prototype.createHammersleySampleTexture = function( samples )
{
	samples = samples || 8192;
	var size = samples * 3;
	var texels = new Float32Array(size);

	for (var i = 0; i < size; i+=3) {
		//var dphi = Tools.BLI_hammersley_1d(i);
		var dphi = Math.radical_inverse(i);
		var phi = dphi * 2.0 * Math.PI;
		texels[i] = Math.cos(phi);
		texels[i+1] = Math.sin(phi);
		texels[i+2] = 0;
	}

	var texture = new GL.Texture(samples, 1, { pixel_data: texels, type: GL.FLOAT, format: GL.RGB });
	gl.textures["hammersley_sample_texture"] = texture;
	return texture;
}

PBRPipeline.prototype.setClippingPlane = function(P,N)
{
	if(!P)
		this.global_uniforms.u_clipping_plane.set([0,0,0,0]);
	else
		this.global_uniforms.u_clipping_plane.set([N[0],N[1],N[2],vec3.dot(P,N)]);
}

Math.radical_inverse = function(n)
{
   var u = 0;
   for (var p = 0.5; n; p *= 0.5, n >>= 1)
	   if (n & 1)
		   u += p;
   return u;
}

//encapsulates one render call, helps sorting
function RenderCall()
{
	this.name = "";
	this.id = -1;
	this.mesh = null;
	this.model = null;
	this.index_buffer_name = "triangles";
	this.group_index = -1;
	this.material = null;
	this.reverse_faces = false;

	this.node = null;

	this._render_priority = 0;
}

var temp_vec3 = vec3.create();

RenderCall.prototype.computeRenderPriority = function( point )
{
	this.name = this.node.name;
	var bb = this.mesh.getBoundingBox();
	if(!bb)
		return;
	var pos = mat4.multiplyVec3( temp_vec3, this.model, bb );
	this._render_priority = this.material.priority || 0;
	this._render_priority += vec3.distance( point, pos ) * 0.001;
	if(this.material.alphaMode == "BLEND")
		this._render_priority -= 100;
}

RD.PBRPipeline = PBRPipeline;
RD.RenderCall = RenderCall;

})(typeof(window) != "undefined" ? window : (typeof(self) != "undefined" ? self : global ));