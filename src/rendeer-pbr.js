(function(global){
var RD = global.RD;

//Adds a pipeline to render in PBR
//It supports rendering in deferred mode or forward mode
function PBRPipeline( renderer )
{
	this.renderer = renderer;
	this.mode = PBRPipeline.FORWARD;
	this.visible_layers = 0xFFFF;
	this.bgcolor = vec4.fromValues(0.1,0.1,0.1,1.0);
	this.environment_texture = null;
	this.render_skybox = true;
	this.skybox_texture = null; //in case is different from the environment texture
	this.environment_sh_coeffs = null;
	this.environment_rotation = 180;
	this.environment_factor = 1;
	this.exposure = 1;
	this.occlusion_factor = 1;
	this.occlusion_gamma = 1;
	this.emissive_factor = 1.0; //to boost emissive
	this.postfx_shader_name = null; //allows to apply a final FX after tonemapper
	this.timer_queries_enabled = true;

	this.contrast = 1.0;
	this.brightness = 1.0;
	this.gamma = 2.2;

	this.parallax_reflection = false;
	this.parallax_reflection_matrix = mat4.create();
	this.parallax_reflection_matrix_inv = mat4.create();

	this.texture_matrix = mat3.create();

	this.resolution_factor = 1;
	this.quality = 1;
	this.test_visibility = true;
	this.single_pass = false;

	this.skip_background = false;

	this.allow_instancing = true;
	this.debug_instancing = false; //shows only instancing elements

	this.use_rendertexture = true;
	this.fx = null;

	this.alpha_composite_target_texture = null;

	this.frame_time = -1;

	//this.overwrite_shader_name = "normal";
	//this.overwrite_shader_mode = "occlusion.js";

	this.global_uniforms = {
		u_brdf_texture: 0,
		u_exposure: this.exposure,
		u_occlusion_factor: this.occlusion_factor,
		u_occlusion_gamma: this.occlusion_gamma,
		u_background_color: this.bgcolor.subarray(0,3),
		u_tonemapper: 0,
		u_gamma: this.gamma,
		u_SpecularEnvSampler_texture: 1,
		u_skybox_mipCount: 5,
		u_skybox_info: [ this.environment_rotation, this.environment_factor ],
		u_use_environment_texture: false,
		u_viewport: gl.viewport_data,
		u_camera_perspective: 1,
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
		u_backface_color: vec3.fromValues(0.5,0.5,0.5),
		u_normalFactor: 1,
		u_metallicRough: false, //use metallic rough texture
		u_reflectance: 0.1, //multiplied by the reflectance function
		u_texture_matrix: this.texture_matrix,
		u_displacement_factor: 0.0,

		u_maps_info: new Int8Array(10), //info about channels

		u_clearCoat: 0.0,
		u_clearCoatRoughness: 0.5,
	
		u_isAnisotropic: false,
		u_anisotropy: 0.5,
		u_anisotropy_direction: vec3.fromValues(0,0,1.0)
	};

	this.sampler_uniforms = {};
	this._instancing_uniforms = {};

	this.material_uniforms.u_maps_info.fill(-1);

	this.fx_uniforms = {
		u_viewportSize: vec2.create(),
		u_iViewportSize: vec2.create()
	};

	this.final_texture = null; //HDR image that contains the final scene before tonemapper
	this.final_fbo = null;

	this.current_camera = null;

	this.compiled_shaders = {};//new Map();

	this.max_textures = gl.getParameter( gl.MAX_TEXTURE_IMAGE_UNITS );
	this.max_texture_size = gl.getParameter( gl.MAX_TEXTURE_SIZE );

	this.default_material = new RD.Material();

	this.onRenderBackground = null;
}

PBRPipeline.FORWARD = 1;
PBRPipeline.DEFERRED = 2;

PBRPipeline.MACROS = {
	UVS2:		1,	
	COLOR:		1<<1,
	POINTS:		1<<2,
	INSTANCING: 1<<3,
	SKINNING:	1<<4,
	MORPHTARGETS:	1<<5,
	PARALLAX_REFLECTION: 1<<6
};

PBRPipeline.maps = ["albedo","metallicRoughness","occlusion","normal","emissive","opacity","displacement","detail"];
PBRPipeline.maps_sampler = [];
for( var i = 0; i <  PBRPipeline.maps.length; ++i )
	PBRPipeline.maps_sampler[i] = "u_" + PBRPipeline.maps[i] + "_texture";

PBRPipeline.prototype.render = function( renderer, renderables, lights, camera, scene, target_fbo, layers )
{
	this.renderer = renderer;
	this.current_camera = camera;
	var skip_fbo = false;

	//render
	if(this.mode == PBRPipeline.FORWARD)
		this.renderForward( renderables, lights, camera, skip_fbo, layers );
	else if(this.mode == PBRPipeline.DEFERRED)
		this.renderDeferred( renderables, lights, camera, layers );
}

//gathers uniforms that do not change between rendered objects
//called when the rendering of a scene starts, before the skybox
PBRPipeline.prototype.fillGlobalUniforms = function( camera )
{
	var brdf_tex = this.getBRDFIntegratorTexture();// "data/brdf_integrator.bin"
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
	this.global_uniforms.u_occlusion_factor = this.occlusion_factor;
	this.global_uniforms.u_occlusion_gamma = this.occlusion_gamma;
	this.global_uniforms.u_background_color = this.bgcolor.subarray(0,3);
	this.global_uniforms.u_camera_perspective = camera._projection_matrix[5];
	this.global_uniforms.u_tonemapper = 0;

	if( this.quality ) //medium and high
	{
		this.global_uniforms.u_exposure = this.exposure;
		this.global_uniforms.u_gamma = this.gamma;
	}
	else //low
	{
		this.global_uniforms.u_exposure = Math.pow( this.exposure, 1.0/2.2 );
		this.global_uniforms.u_gamma = this.use_rendertexture ? this.gamma : 1.0;
	}
}

PBRPipeline.prototype.renderForward = function( renderables, lights, camera, skip_fbo, layers )
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
		if(!this.frame_texture || this.frame_texture.width != w || this.frame_texture.height != h )
		{
			this.frame_texture = new GL.Texture( w,h, { format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR } );
			if(!this.final_fbo)
				this.final_fbo = new GL.FBO( [this.frame_texture], null, true );
			else
				this.final_fbo.setTextures( [this.frame_texture] );
			this.frame_texture.name = ":frame_texture";
			gl.textures[ this.frame_texture.name ] = this.frame_texture;

			this.final_texture = new GL.Texture( w,h, { format: gl.RGB, filter: gl.LINEAR } );
			this.final_texture.name = ":final_frame_texture";
			gl.textures[ this.final_texture.name ] = this.final_texture;
		}

		this.final_fbo.bind(0);
	}

	//prepare render
	gl.clearColor( this.bgcolor[0], this.bgcolor[1], this.bgcolor[2], this.bgcolor[3] );
	gl.clear( (!this.skip_background ? gl.COLOR_BUFFER_BIT : 0) | gl.DEPTH_BUFFER_BIT );

	//set default 
	gl.frontFace( gl.CCW );
	gl.enable( gl.DEPTH_TEST );
	gl.disable( gl.BLEND );

	//render skybox
	if(!this.skip_background)
	{
		if(this.onRenderBackground)
			this.onRenderBackground( camera, this );
		else
			this.renderSkybox( camera );
		LEvent.trigger( this, "renderSkybox", this );
	}

	this.fillGlobalUniforms( camera );

	if(this.onRenderOpaque)
		this.onRenderOpaque( this, this.renderer, camera );
	LEvent.trigger( this, "renderOpaque", this );

	//render every renderable
	this.renderRenderables( renderables, camera, layers );

	//some useful callbacks
	if(this.onRenderAlpha)
		this.onRenderAlpha( this, this.renderer, camera );
	LEvent.trigger( this, "renderAlpha", this );

	if(this.onRenderGizmos)
		this.onRenderGizmos( this, this.renderer, camera );
	LEvent.trigger( this, "renderGizmos", this );

	//if not rendering to viewport, now we must render the buffer to the viewport
	if(this.use_rendertexture && !skip_fbo)
		this.renderFinalBuffer();

	//overlay nodes are special case of nodes that should not be affected by postprocessing
	var opaque = true;
	if( this.renderer.overlay_renderables && this.renderer.overlay_renderables.length )
	{
		var overlay_rcs = this.renderer.overlay_renderables;
		this.global_uniforms.u_gamma = 1.0;
		this.global_uniforms.u_exposure = 1.0;
		gl.clear( gl.DEPTH_BUFFER_BIT );
		for(var i = 0; i < overlay_rcs.length; ++i)
		{
			var rc = overlay_rcs[i];
			this.renderMeshWithMaterial( rc.model, rc.mesh, rc.material, rc.index_buffer_name, rc.group_index, rc.node.extra_uniforms, rc.reverse_faces, rc.skin );
		}
	}
}

//extracts rendercalls and renders them
PBRPipeline.prototype.renderRenderables = function( renderables, camera, layers )
{
	var precompose_opaque = (this.alpha_composite_callback || this.alpha_composite_target_texture) && GL.FBO.current;
	var opaque = true;

	//do the render call for every renderable
	for(var i = 0; i < renderables.length; ++i)
	{
		var renderable = renderables[i];

		//clone the opaque framebuffer into a separate texture once the first semitransparent material is found (to allow refractive materials)
		//allows to have refractive materials
		if( opaque && precompose_opaque && renderable.material.alphaMode == "BLEND")
		{
			opaque = false;
			if(this.alpha_composite_target_texture)
				GL.FBO.current.color_textures[0].copyTo( this.alpha_composite_target_texture );
			if( this.alpha_composite_callback )
				this.alpha_composite_callback( GL.FBO.current, this.alpha_composite_target_texture );
		}

		//render opaque stuff
		this.renderRenderable( renderable, camera );
	}
}


//after filling the final buffer (from renderForward) it applies FX and tonemmaper
PBRPipeline.prototype.renderFinalBuffer = function()
{
	this.final_fbo.unbind(0);

	gl.disable( GL.BLEND );
	gl.disable( GL.DEPTH_TEST );

	if(this.fx)
		this.fx.applyFX( this.frame_texture, null, this.frame_texture );

	this.fx_uniforms.u_viewportSize[0] = this.frame_texture.width;
	this.fx_uniforms.u_viewportSize[1] = this.frame_texture.height;
	this.fx_uniforms.u_iViewportSize[0] = 1/this.frame_texture.width;
	this.fx_uniforms.u_iViewportSize[1] = 1/this.frame_texture.height;

	this.fx_uniforms.u_contrast = this.contrast;
	this.fx_uniforms.u_brightness = this.brightness;
	this.fx_uniforms.u_gamma = this.gamma;
	this.frame_texture.copyTo( this.final_texture, gl.shaders["fxaa_tonemapper"], this.fx_uniforms );
	
	var shader_postfx = null;
	if(this.postfx_shader_name)
	{
		shader_postfx = gl.shaders[ this.postfx_shader_name ];
		if( shader_postfx )
			shader_postfx.setUniform( "u_size", [this.final_texture.width,this.final_texture.height] );
	}

	this.final_texture.toViewport( shader_postfx );
}

PBRPipeline.prototype.setParallaxReflectionTransform = function( transform )
{
	this.parallax_reflection_matrix.set( transform );
	this.parallax_reflection = true;
	this.global_uniforms.u_cube_reflection_matrix = this.parallax_reflection_matrix;
	mat4.invert( this.parallax_reflection_matrix_inv, this.parallax_reflection_matrix );
	this.global_uniforms.u_inv_cube_reflection_matrix = this.parallax_reflection_matrix_inv;
}

PBRPipeline.prototype.resetShadersCache = function()
{
	this.compiled_shaders = {};
}

PBRPipeline.prototype.getShader = function( macros, fragment_shader_name, vertex_shader_name )
{
	vertex_shader_name = vertex_shader_name || "";
	var fullshadername = vertex_shader_name + ":" + fragment_shader_name;

	var container = this.compiled_shaders[fullshadername];
	if(!container)
		container = this.compiled_shaders[fullshadername] = new Map();

	var shader = container.get( macros );
	if(shader)
		return shader;

	if(!this.renderer.shader_files)
		return null;

	var vs = this.renderer.shader_files[ vertex_shader_name || "default.vs" ];
	var fs = this.renderer.shader_files[ fragment_shader_name ];

	if(!vs || !fs)
		return null;

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


PBRPipeline.default_backface_color = [0.1,0.1,0.1];

PBRPipeline.prototype.renderRenderable = function( rc, camera )
{
	var model = rc.model;
	var material = rc.material;
	var mesh = rc.mesh;
	var skeleton = rc.skin;
	var renderer = this.renderer;
	var primitive = rc.primitive;
	var group_index = rc.group_index;

	var shader = null;
	if(!material || material.constructor === String)
		throw("no material in renderRenderable");

	//not visible
	if(material.alphaMode == "BLEND" && material.color[3] <= 0.0)
		return;

	var material_uniforms = this.material_uniforms;
	var sampler_uniforms = this.sampler_uniforms;
	var num_instances = rc.instances ? rc.instances.length : 1;

	//materials
	material_uniforms.u_albedo = material.color.subarray(0,3);
	material_uniforms.u_emissive.set( material.emissive || RD.ZERO );
	if(this.emissive_factor != 1.0)
		vec3.scale( material_uniforms.u_emissive, material_uniforms.u_emissive, this.emissive_factor );
	material_uniforms.u_backface_color = material.backface_color || PBRPipeline.default_backface_color;

	//compute final shader
	var shader = null;

	var macros = 0;
	if(mesh.vertexBuffers.coords1)
		macros |= PBRPipeline.MACROS.UVS2;
	if(mesh.vertexBuffers.colors)
		macros |= PBRPipeline.MACROS.COLOR;
	if( skeleton )
		macros |= PBRPipeline.MACROS.SKINNING;
	if( rc.morphs )
		macros |= PBRPipeline.MACROS.MORPHTARGETS;

	if( this.parallax_reflection )
		macros |= PBRPipeline.MACROS.PARALLAX_REFLECTION;

	if( material.primitive == GL.POINTS )
		macros |= PBRPipeline.MACROS.POINTS;

	if( num_instances > 1 )
		macros |= PBRPipeline.MACROS.INSTANCING;

	if( this.overwrite_shader_name ) //in case of global shader
	{
		shader = gl.shaders[ this.overwrite_shader_name ];
	}
	else if( this.overwrite_shader_mode ) //similar to previous one, but it allows branching
	{
		shader = this.getShader( macros, this.overwrite_shader_mode );
	}
	else if( material.shader_name ) //in case of custom shader
	{
		shader = gl.shaders[ material.shader_name ];
	}
	else if( material.overlay ) //special usecase
	{
		shader = this.getShader( macros, "overlay.fs" );
	}
	else if( material.model == "pbrMetallicRoughness" && this.quality )
	{
		material_uniforms.u_metalness = material.metallicFactor;
		material_uniforms.u_roughness = material.roughnessFactor;
		material_uniforms.u_metallicRough = Boolean( material.textures["metallicRoughness"] );
		shader = this.getShader( macros, "pbr.fs" );
	}
	/*
	else if( material.model == "custom" && material.shader_name )
	{
		shader = this.getShader( macros, material.shader_name );
	}
	*/
	else
	{
		shader = this.getShader( macros, "nopbr.fs" );
	}

	if(!shader)
		return;

	material_uniforms.u_alpha = material.opacity;
	material_uniforms.u_alpha_cutoff = 0.0; //disabled

	material_uniforms.u_normalFactor = material.normalmapFactor != null ? material.normalmapFactor : 1.0;
	material_uniforms.u_displacement_factor = material.displacementFactor != null ? material.displacementFactor : 1.0;

	//sent as u_texture_matrix
	if(material.uv_transform)
		this.texture_matrix.set( material.uv_transform );
	else
		mat3.identity( this.texture_matrix );

	//textures
	var slot = 2; //skip 0 and 1 as are in use
	var last_slot = 2;
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

		var texture_uniform_name = PBRPipeline.maps_sampler[i]; //"u_" + map + "_texture";

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

		if( texture_info && texture_info.uv_channel != null )
			maps_info[i] = Math.clamp( texture_info.uv_channel, 0, 3 );
		else
			maps_info[i] = 0;
		last_slot = tex_slot;
	}

	if(rc.morphs)
		shader.uniforms({u_morph_texture:rc.morphs.bind(++last_slot)});

	//flags
	if( !rc.reverse_faces )
		gl.frontFace( GL.CCW );
	renderer.enableItemFlags( material );
	if( rc.reverse_faces )
		gl.frontFace( GL.CW );

	if(material.alphaMode == "BLEND")
	{
		gl.enable(gl.BLEND);
		if(material.additive || material.blendMode == "ADD")
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE );
		else if(material.blendMode == "MULTIPLY")
			gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA );
		else //"ALPHA"
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.depthMask( false );
		material_uniforms.u_alpha_cutoff = 0.0;
	}
	else if(material.alphaMode == "MASK")
	{
		material_uniforms.u_alpha_cutoff = material.alphaCutoff;
	}
	else
	{
		//material_uniforms.u_alpha_cutoff = -1; //already done
		gl.disable(gl.BLEND);
	}

	//skinning
	if( skeleton && shader.uniformInfo.u_bones )
	{
		if(skeleton.constructor === RD.Skeleton)
		{
			this.bones = skeleton.computeFinalBoneMatrices( this.bones, mesh );
			shader.setUniform("u_bones", this.bones );
		}
		else if(skeleton._bone_matrices)
			shader.setUniform("u_bones", skeleton._bone_matrices );
	}

	/*
	if(skinning_info)
	{
		if( skinning_info.constructor === RD.Skeleton )
		{
			this.bones = skinning_info.computeFinalBoneMatrices( this.bones, mesh );
			shader.setUniform("u_bones", this.bones );
		}
		else if( skinning_info._bone_matrices )  //node.updateSkinningBones updates this
		{
			shader.setUniform("u_bones", skinning_info._bone_matrices );
		}
		else
		{
			//console.warn( "skinning info not valid", skinning_info );
			return;
		}

		//when skin is joints, they contain the model already
		if( skinning_info.joints )
			skinning_info.skip_model = true;
	}
	*/

	if( num_instances == 1 )
		renderer._uniforms.u_model.set( model );

	if( skeleton && skeleton.skip_model )
		mat4.identity( renderer._uniforms.u_model );

	shader.uniforms( renderer._uniforms ); //globals
	shader.uniforms( this.global_uniforms ); 
	shader.uniforms( camera._uniforms ); 
	shader.uniforms( material.uniforms ); //custom
	shader.uniforms( material_uniforms ); //locals
	shader.uniforms( sampler_uniforms ); //locals
	//if(extra_uniforms)
	//	shader.uniforms( extra_uniforms );

	if( material.primitive == GL.POINTS )
		shader.setUniform("u_pointSize", material.point_size || -1);


	var group = null;
	if( group_index != null && mesh.info && mesh.info.groups && mesh.info.groups[ group_index ] )
		group = mesh.info.groups[ group_index ];

	if( material.primitive > -1)
		primitive = material.primitive;

	var instancing_uniforms = this._instancing_uniforms;
	if( rc.instances )
		instancing_uniforms.u_model = rc.instances.flat();

	var index_buffer_name = rc.index_buffer_name || "triangles"

	//hack to render alpha objects first in the depth buffer, and then again (used in very specific cases)
	//doesnt work well with instancing
	if(material.flags.preAlpha)
	{
		gl.colorMask(false,false,false,false);
		gl.depthMask( true );
		//gl.enable( gl.CULL_FACE );
		//gl.frontFace( reverse_faces ? gl.CCW : gl.CW );
		if(num_instances > 1)
			shader.drawInstanced( mesh, primitive, index_buffer_name, instancing_uniforms );
		else if(group)
			shader.drawRange( mesh, primitive, group.start, group.length, index_buffer_name );
		else
			shader.draw( mesh, primitive, index_buffer_name );
		gl.colorMask(true,true,true,true);
		gl.depthFunc( gl.LEQUAL );
		//gl.frontFace( reverse_faces ? gl.CW : gl.CCW );
		this.rendered_renderables++;
	}

	if(num_instances > 1)
	{
		if(group)
			shader.drawInstanced( mesh, primitive, index_buffer_name, instancing_uniforms, group.start, group.length );
		else
			shader.drawInstanced( mesh, primitive, index_buffer_name, instancing_uniforms );
	}
	else
	{
		if(group)
			shader.drawRange( mesh, primitive, group.start, group.length, index_buffer_name );
		else
			shader.draw( mesh, primitive, index_buffer_name );
	}
	this.rendered_renderables++;

	renderer.disableItemFlags( material );
	if( rc.reverse_faces )
		gl.frontFace( GL.CCW );

	gl.depthFunc( gl.LESS );
	gl.depthMask( true );
}

PBRPipeline.prototype.renderDeferred = function( renderables, lights, camera, skip_fbo, layers )
{
	//TODO
	//setup GBuffers
	var GB = this.prepareGBuffers();

	//render to GBuffers
	GB.fbo.bind();
	this.renderToGBuffers( renderables, camera, layers );
	GB.fbo.unbind();

	GB.final_fbo.bind();

	//get  lights
	//var lights = this.gatherLightsFromNodes( renderables, layers );

	//apply lights
	this.renderFinalPass(GB, lights, camera);
	
	//render blend objects in forward reusing forward pipeline
	//...

	GB.final_fbo.unbind();

	//apply FX
	this.applyPostFX( GB );
}

PBRPipeline.prototype.prepareGBuffers = function( camera )
{
	var w = gl.drawingBufferWidth;
	var h = gl.drawingBufferHeight;

	if(this._gbuffers && this._gbuffers.width == w && this._gbuffers.height == h )
		return this._gbuffers;

	if(!this._gbuffers)
		this._gbuffers = {};
	var GB = this._gbuffers;
	if(!GB.fbo)
		GB.fbo = new GL.FBO();
	if(!GB.final_fbo)
		GB.final_fbo = new GL.FBO();
	GB.width = w;
	GB.height = h;
	var options = { format: GL.RGBA, filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE };
	var albedo = new GL.Texture(w,h,options); //albedo, back?
	var matprop = new GL.Texture(w,h,options); //metalness, roughness, selfocclusion, mat_id
	var emissive = new GL.Texture(w,h,options); //emissive + lightmap, exp
	var normal = new GL.Texture(w,h,options); //normal, 
	var depth = new GL.Texture(w,h,{ format: GL.DEPTH_STENCIL, type: GL.UNSIGNED_INT_24_8, filter: gl.NEAREST }); //depth stencil
	GB.fbo.setTextures([ albedo, matprop, emissive, normal ], depth );
	var final_buffer = new GL.Texture(w,h,{ format: GL.RGBA, type: gl.HALF_FLOAT, filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE });
	GB.final_fbo.setTextures([final_buffer]);

	GB.albedo = albedo;
	GB.matprop = matprop;
	GB.emissive = emissive;
	GB.normal = normal;
	GB.depth = depth;
	GB.final = final_buffer;

	return GB;
}

PBRPipeline.prototype.renderToGBuffers = function( renderables, camera, layers )
{
	//prepare render
	gl.clearColor( this.bgcolor[0], this.bgcolor[1], this.bgcolor[2], this.bgcolor[3] );
	gl.clear( (!this.skip_background ? gl.COLOR_BUFFER_BIT : 0) | gl.DEPTH_BUFFER_BIT );

	//set default 
	gl.frontFace( gl.CCW );
	gl.enable( gl.DEPTH_TEST );
	gl.disable( gl.BLEND );

	this.fillGlobalUniforms( camera );

	//filter calls by blend


	//do the render call for every rcs
	for(var i = 0; i < renderables.length; ++i)
	{
		var rc = renderables[i];
		this.renderMeshWithMaterialToGBuffers( rc.model, rc.mesh, rc.material, rc.index_buffer_name, rc.group_index, rc.node.extra_uniforms, rc.reverse_faces, rc.skin );
	}
}

PBRPipeline.prototype.renderFinalPass = function( GB, lights, camera )
{
	//for every light...
	gl.disable( gl.DEPTH_TEST );
	gl.disable( gl.BLEND );

	var shader = gl.shaders["deferred_global"];
	if(!shader)
		return;

	GB.albedo.toViewport( shader, {
		normal_texture: GB.normal.bind(1),
		material_texture: GB.matprop.bind(2),
		emissive_texture: GB.emissive.bind(3),
		depth_texture: GB.depth.bind(4),
		u_invVP: camera._inv_viewprojection_matrix
	});
}

PBRPipeline.prototype.applyPostFX = function( GB )
{
	gl.disable( GL.DEPTH_TEST );
	gl.disable( GL.BLEND );
	var w = GB.width;
	var h = GB.height;

	if(this.debug)
	{
		gl.viewport(0,0,w*0.5,h*0.5);
		GB.albedo.toViewport();
		gl.viewport(w*0.5,0,w*0.5,h*0.5);
		GB.matprop.toViewport();
		gl.viewport(0,h*0.5,w*0.5,h*0.5);
		GB.emissive.toViewport();
		gl.viewport(w*0.5,h*0.5,w*0.5,h*0.5);
		GB.normal.toViewport();
		gl.viewport(0,0,w,h);
	}
	GB.final.toViewport();
}

PBRPipeline.prototype.renderMeshWithMaterialToGBuffers = function( model_matrix, mesh, material, index_buffer_name, group_index, extra_uniforms, reverse_faces, skinning_info )
{
	var renderer = this.renderer;
	var camera = renderer._camera;

	var shader = null;

	if(!material || material.constructor === String)
		throw("no material in renderMeshWithMaterial");

	//render
	if(material.alphaMode == "BLEND" )
		return;

	var material_uniforms = this.material_uniforms;
	var sampler_uniforms = this.sampler_uniforms;
	var num_instances = model_matrix.length / 16;

	//materials
	material_uniforms.u_albedo = material.color.subarray(0,3);
	material_uniforms.u_emissive.set( material.emissive || RD.ZERO );
	if(this.emissive_factor != 1.0)
		vec3.scale( material_uniforms.u_emissive, material_uniforms.u_emissive, this.emissive_factor );
	material_uniforms.u_backface_color = material.backface_color || PBRPipeline.default_backface_color;

	//compute final shader
	var shader = null;

	var macros = 0;
	if(mesh.vertexBuffers.coords1)
		macros |= PBRPipeline.MACROS.UVS2;
	if(mesh.vertexBuffers.colors)
		macros |= PBRPipeline.MACROS.COLOR;
	if( skinning_info )
		macros |= PBRPipeline.MACROS.SKINNING;

	if( material.primitive == GL.POINTS )
		macros |= PBRPipeline.MACROS.POINTS;

	if( num_instances > 1 )
		macros |= PBRPipeline.MACROS.INSTANCING;

	shader = this.getShader( macros, "gbuffer.fs" );

	if(!shader)
		return;

	material_uniforms.u_alpha = material.opacity;
	material_uniforms.u_alpha_cutoff = 0.0;

	material_uniforms.u_normalFactor = material.normalmapFactor != null ? material.normalmapFactor : 1.0;
	material_uniforms.u_displacement_factor = material.displacementFactor != null ? material.displacementFactor : 1.0;

	//sent as u_texture_matrix
	if(material.uv_transform)
		this.texture_matrix.set( material.uv_transform );
	else
		mat3.identity( this.texture_matrix );

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

		var texture_uniform_name = PBRPipeline.maps_sampler[i]; //"u_" + map + "_texture";

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

		if( texture_info && texture_info.uv_channel != null )
			maps_info[i] = Math.clamp( texture_info.uv_channel, 0, 3 );
		else
			maps_info[i] = 0;
	}

	//flags
	if( !reverse_faces )
		gl.frontFace( GL.CCW );
	renderer.enableItemFlags( material );
	if( reverse_faces )
		gl.frontFace( GL.CW );

	if(material.alphaMode == "MASK")
		material_uniforms.u_alpha_cutoff = material.alphaCutoff;

	if(skinning_info)
	{
		if( skinning_info.constructor === RD.Skeleton )
		{
			this.bones = skinning_info.computeFinalBoneMatrices( this.bones, mesh );
			shader.setUniform("u_bones", this.bones );
		}
		else if( skinning_info._bone_matrices )  //node.updateSkinningBones updates this
		{
			shader.setUniform("u_bones", skinning_info._bone_matrices );
		}
		else
		{
			//console.warn( "skinning info not valid", skinning_info );
			return;
		}

		//when skin is joints, they contain the model already
		if( skinning_info.joints )
			skinning_info.skip_model = true;
	}

	if( num_instances == 1 )
		renderer._uniforms.u_model.set( model_matrix );

	if( skinning_info && skinning_info.skip_model )
		mat4.identity( renderer._uniforms.u_model );

	shader.uniforms( renderer._uniforms ); //globals
	shader.uniforms( this.global_uniforms ); 
	shader.uniforms( camera._uniforms ); 
	shader.uniforms( material.uniforms ); //custom
	shader.uniforms( material_uniforms ); //locals
	shader.uniforms( sampler_uniforms ); //locals
	if(extra_uniforms)
		shader.uniforms( extra_uniforms );

	if( material.primitive == GL.POINTS )
		shader.setUniform("u_pointSize", material.point_size || -1);

	var group = null;
	if( group_index != null && mesh.info && mesh.info.groups && mesh.info.groups[ group_index ] )
		group = mesh.info.groups[ group_index ];

	var instancing_uniforms = this._instancing_uniforms;
	instancing_uniforms.u_model = model_matrix;
	var primitive = gl.TRIANGLES;

	if(num_instances > 1)
	{
		if(group)
			shader.drawInstanced( mesh, primitive, index_buffer_name, instancing_uniforms, group.start, group.length );
		else
			shader.drawInstanced( mesh, primitive, index_buffer_name, instancing_uniforms );
	}
	else
	{
		if(group)
			shader.drawRange( mesh, primitive, group.start, group.length, index_buffer_name );
		else
			shader.draw( mesh, primitive, index_buffer_name );
	}
	this.rendered_renderables++;

	renderer.disableItemFlags( material );
	if( reverse_faces )
		gl.frontFace( GL.CCW );

	gl.depthFunc( gl.LESS );
	gl.depthMask( true );
}


// ********************************************************

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
	if(!texture || texture.texture_type !== GL.TEXTURE_CUBE_MAP)
		return;

	gl.disable( gl.CULL_FACE );
	gl.disable( gl.DEPTH_TEST );
	gl.disable( gl.BLEND );
	var model = this.renderer._model_matrix;
	mat4.identity( model );
	mat4.translate( model, model, camera.position );
	mat4.scale( model, model, [10,10,10] ); //to avoid overlaps
	shader.uniforms( this.renderer._uniforms );
	shader.uniforms( camera._uniforms );
	shader.uniforms({
		u_color_texture: texture.bind(1), //u_SpecularEnvSampler_texture uses also 1
		u_is_rgbe: false,
		u_exposure: this.exposure,
		u_mipmap_offset: 0,
		u_rotation: this.environment_rotation * DEG2RAD,
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

	//should be float
	var options = { format: gl.RGBA, type: gl.FLOAT, texture_type: gl.TEXTURE_2D, filter: gl.LINEAR};
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

//they are random values
PBRPipeline.prototype.createHammersleySampleTexture = function( samples )
{
	samples = samples || 8192;
	var size = samples * 4;
	var texels = new Float32Array(size);

	for (var i = 0; i < size; i+=4) {
		//var dphi = Tools.BLI_hammersley_1d(i);
		var dphi = Math.radical_inverse(i);
		var phi = dphi * 2.0 * Math.PI;
		texels[i] = Math.cos(phi);
		texels[i+1] = Math.sin(phi);
	}
	var texture = new GL.Texture(samples, 1, { type: gl.FLOAT, format: gl.RGBA, filter: gl.LINEAR, pixel_data: texels });
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


//time queries for profiling
PBRPipeline.prototype.startGPUQuery = function()
{
	if(!gl.extensions["EXT_disjoint_timer_query"] || !this.timer_queries_enabled) //if not supported
		return;
	var ext = gl.extensions["EXT_disjoint_timer_query"];

	if( this._waiting_gpu_query )
		return;

	if( this._useQueryTimestamps === undefined )
	{
		this._useQueryTimestamps = false;
		if (ext.getQueryEXT(ext.TIMESTAMP_EXT, ext.QUERY_COUNTER_BITS_EXT) > 0)
			this._useQueryTimestamps = true;
	}

	// Clear the disjoint state before starting to work with queries to increase
	// the chances that the results will be valid.
	gl.getParameter(ext.GPU_DISJOINT_EXT);

	if (this._useQueryTimestamps) {
	  this._start_gpu_query = ext.createQueryEXT();
	  this._end_gpu_query = ext.createQueryEXT();
	  ext.queryCounterEXT(this._start_gpu_query, ext.TIMESTAMP_EXT);
	} else {
	  this._timeElapsed_gpu_query = ext.createQueryEXT();
	  ext.beginQueryEXT( ext.TIME_ELAPSED_EXT, this._timeElapsed_gpu_query );
	}
}

PBRPipeline.prototype.endGPUQuery = function()
{
	if(!gl.extensions["EXT_disjoint_timer_query"] || !this.timer_queries_enabled || this._waiting_gpu_query)
		return;
	var ext = gl.extensions["EXT_disjoint_timer_query"];
	if (this._useQueryTimestamps) {
	  ext.queryCounterEXT(this._end_gpu_query, ext.TIMESTAMP_EXT);
	} else {
	  ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
	}
	this._waiting_gpu_query = true;
}


PBRPipeline.prototype.resolveQueries = function()
{
	if(!gl.extensions["EXT_disjoint_timer_query"] || !this.timer_queries_enabled) //if not supported
		return;
	var ext = gl.extensions["EXT_disjoint_timer_query"];

	var startQuery = this._start_gpu_query;
	var endQuery = this._end_gpu_query;
	var timeElapsedQuery = this._timeElapsed_gpu_query;
	var useTimestamps = this._useQueryTimestamps;

	if (startQuery || endQuery || timeElapsedQuery) {
	  var disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
	  var available;
	  if (disjoint) {
		// Have to redo all of the measurements.
	  } else {
		if (useTimestamps) {
		  available = ext.getQueryObjectEXT(endQuery, ext.QUERY_RESULT_AVAILABLE_EXT);
		} else {
		  available = ext.getQueryObjectEXT(timeElapsedQuery, ext.QUERY_RESULT_AVAILABLE_EXT);
		}

		if (available) {
		  var timeElapsed;
		  if (useTimestamps) {
			// See how much time the rendering of the object took in nanoseconds.
			var timeStart = ext.getQueryObjectEXT(startQuery, ext.QUERY_RESULT_EXT);
			var timeEnd = ext.getQueryObjectEXT(endQuery, ext.QUERY_RESULT_EXT);
			timeElapsed = timeEnd - timeStart;
		  } else {
			timeElapsed = ext.getQueryObjectEXT(timeElapsedQuery, ext.QUERY_RESULT_EXT);
		  }

		  this.frame_time = timeElapsed * 0.000001; //from nano to milli
		}
	  }

	  if (available || disjoint) {
		// Clean up the query objects.
		if (useTimestamps) {
		  ext.deleteQueryEXT(startQuery);
		  ext.deleteQueryEXT(endQuery);
		  // Don't re-enter the polling loop above.
		  this._start_gpu_query = null;
		  this._end_gpu_query = null;
		} else {
		  ext.deleteQueryEXT(timeElapsedQuery);
		  this._timeElapsed_gpu_query = null;
		}
		this._waiting_gpu_query = false;
	  }
	}

	return this.frame_time;
}

Math.radical_inverse = function(n)
{
   var u = 0;
   for (var p = 0.5; n; p *= 0.5, n >>= 1)
	   if (n & 1)
		   u += p;
   return u;
}

RD.PBRPipeline = PBRPipeline;


})(this);