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
	this.allow_overlay = true;

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
		u_emissive: vec4.fromValues(0,0,0,0),
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

	this.render_calls = []; //current
	this.render_calls_pool = []; //total
	this.used_render_calls = 0;
	this.rendered_render_calls = 0;

	this.current_camera = null;
	this.overlay_rcs = [];

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
	PARALLAX_REFLECTION: 1<<5
};

PBRPipeline.maps = ["albedo","metallicRoughness","occlusion","normal","emissive","opacity","displacement","detail"];
PBRPipeline.maps_sampler = [];
for( var i = 0; i <  PBRPipeline.maps.length; ++i )
	PBRPipeline.maps_sampler[i] = "u_" + PBRPipeline.maps[i] + "_texture";

PBRPipeline.prototype.render = function( renderer, nodes, camera, scene, skip_fbo, layers )
{
	this.renderer = renderer;
	this.current_camera = camera;

	if(this.mode == PBRPipeline.FORWARD)
		this.renderForward( nodes, camera, skip_fbo, layers );
	else if(this.mode == PBRPipeline.DEFERRED)
		this.renderDeferred( nodes, camera, layers );
}

//gathers uniforms that do not change between rendered objects
//called when the rendering of a scene starts, before the skybox
PBRPipeline.prototype.fillGlobalUniforms = function( camera )
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
		if(!this.frame_texture || this.frame_texture.width != w || this.frame_texture.height != h )
		{
			this.frame_texture = new GL.Texture( w,h, { format: gl.RGBA, type: gl.HIGH_PRECISION_FORMAT, filter: gl.LINEAR } );
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

	//render every node of the scene
	this.renderNodes( nodes, camera, layers );

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
	if( this.overlay_rcs.length )
	{
		var overlay_rcs = this.overlay_rcs;
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
PBRPipeline.prototype.renderNodes = function( nodes, camera, layers )
{
	var rcs = this.getAllRenderCalls( nodes, camera, layers );

	var precompose_opaque = (this.alpha_composite_callback || this.alpha_composite_target_texture) && GL.FBO.current;
	var opaque = true;
	var overlay_rcs = this.overlay_rcs;
	overlay_rcs.length = 0;

	//do the render call for every rcs
	for(var i = 0; i < rcs.length; ++i)
	{
		var rc = rcs[i];
		if(rc.material.overlay && this.allow_overlay )
		{
			overlay_rcs.push(rc);
			continue;
		}

		//clone the opaque framebuffer into a separate texture once the first semitransparent material is found (to allow refractive materials)
		//allows to have refractive materials
		if( opaque && precompose_opaque && rc.material.alphaMode == "BLEND")
		{
			opaque = false;
			if(this.alpha_composite_target_texture)
				GL.FBO.current.color_textures[0].copyTo( this.alpha_composite_target_texture );
			if( this.alpha_composite_callback )
				this.alpha_composite_callback( GL.FBO.current, this.alpha_composite_target_texture );
		}

		//in case of instancing
		var model = rc.model;
		if( rc._instancing && rc._instancing.length )
			model = GL.linearizeArray( rc._instancing, Float32Array );

		//render opaque stuff
		this.renderMeshWithMaterial( model, rc.mesh, rc.material, rc.index_buffer_name, rc.group_index, rc.node.extra_uniforms, rc.reverse_faces, rc.skin );
	}
}

PBRPipeline.prototype.getAllRenderCalls = function( nodes, camera, layers )
{
	//reset render calls pool and clear all 
	this.resetRenderCallsPool();	
	var rcs = this.render_calls;
	rcs.length = 0;

	//extract render calls from scene nodes
	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		this.getNodeRenderCalls( node, camera, layers );
	}

	//sort by alpha and distance
	if(this.onFilterRenderCalls)
		this.onFilterRenderCalls( rcs );
	for(var i = 0; i < rcs.length; ++i)
		rcs[i].computeRenderPriority( camera._position );
	rcs = rcs.sort( PBRPipeline.rc_sort_function );

	//group by instancing
	if( this.allow_instancing && gl.extensions.ANGLE_instanced_arrays )
		rcs = this.groupRenderCallsForInstancing(rcs);

	return rcs;
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
		{
			if( this.renderer.autoload_assets && node.mesh.indexOf(".") != -1)
				this.renderer.loadMesh( node.mesh );
			return;
		}
	}

	if(layers === undefined)
		layers = 0xFFFF;

	//prepare matrix (must be done always or children wont have the right transform)
	node.updateGlobalMatrix(true);

	if(!mesh)
		return;

	if(node.flags.visible === false || !(node.layers & layers) )
		return;

	//skinning can work in two ways: through a RD.Skeleton, or through info about the joints node in the scene
	var skinning = node.skeleton || node.skin || null;
	if( skinning && !skinning.bones && !skinning.joints )
		skinning = null;
	if( skinning && skinning.bones && !skinning.bones.length )
		skinning = null;
	if( skinning && skinning.joints && !skinning.joints.length )
		skinning = null;

	if(skinning && skinning.joints)
	{
		//at least once
		if(!skinning._bone_matrices)
			node.updateSkinningBones( node.parentNode ); //use parent node as root
	}

	//check if inside frustum (skinned objects are not tested)
	if(this.test_visibility && !skinning)
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
			rc._instancing = null;
			rc.reverse_faces = node.flags.frontFace == GL.CW;
			rc.skin = skinning;
			this.render_calls.push( rc );
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
			rc._instancing = null;
			rc.skin = skinning;
			rc._render_priority = material.render_priority || 0;
			rc.reverse_faces = node.flags.frontFace == GL.CW;
			this.render_calls.push( rc );
		}
	}
}

PBRPipeline.prototype.groupRenderCallsForInstancing = function(rcs)
{
	var groups = {};

	var no_group = 0; //used to force no grouping

	//find groups
	for(var i = 0; i < rcs.length; ++i)
	{
		var rc = rcs[i];
		var key = null;
		if (!rc._instancing && !rc.skin)
			key = rc.mesh.name + ":" + rc.group_index + "/" + rc.material.name + (rc.reverse_faces ? "[R]" : "");
		else
			key = no_group++;
		if(!groups[key])
			groups[key] = [rc];
		else
			groups[key].push(rc);
	}

	var final_rcs = [];

	//for every group
	for(var i in groups)
	{
		var group = groups[i];
		if( group.length == 0 )
			continue;

		//single
		if( group.length == 1 )
		{
			var rc = group[0];
			//rc._instancing = null;
			if(!this.debug_instancing)
				final_rcs.push( rc );
			continue;
		}

		var rc = this.getRenderCallFromPool();
		rc.copyFrom( group[0] );
		rc._instancing = new Array(group.length);
		for(var j = 0; j < group.length; ++j)
			rc._instancing[j] = group[j].model;
		final_rcs.push( rc );
	}

	return final_rcs;
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

PBRPipeline.prototype.renderRenderCall = function( rc )
{
	var model = rc.model;
	if( rc._instancing && rc._instancing.length )
		model = new Float32Array( rc._instancing.flat() );

	this.renderMeshWithMaterial( model, rc.mesh, rc.material, rc.index_buffer_name, rc.group_index, rc.node.extra_uniforms, rc.reverse_faces, rc.skin );
}

PBRPipeline.default_backface_color = [0.1,0.1,0.1];

PBRPipeline.prototype.renderMeshWithMaterial = function( model_matrix, mesh, material, index_buffer_name, group_index, extra_uniforms, reverse_faces, skinning_info )
{
	var renderer = this.renderer;

	var shader = null;

	if(!material || material.constructor === String)
		throw("no material in renderMeshWithMaterial");

	//not visible
	if(material.alphaMode == "BLEND" && material.color[3] <= 0.0)
		return;

	var material_uniforms = this.material_uniforms;
	var sampler_uniforms = this.sampler_uniforms;
	var num_instances = model_matrix.length / 16;

	//materials
	material_uniforms.u_albedo = material.color.subarray(0,3);
	material_uniforms.u_emissive.set( material.emissive || RD.ZERO );
	material_uniforms.u_emissive[3] = material.emissive_clamp_to_edge ? 1 : 0; //clamps to black
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

	//hack to render alpha objects first in the depth buffer, and then again (used in very specific cases)
	//doesnt work well with instancing
	if(material.flags.preAlpha)
	{
		gl.colorMask(false,false,false,false);
		gl.depthMask( true );
		//gl.enable( gl.CULL_FACE );
		//gl.frontFace( reverse_faces ? gl.CCW : gl.CW );
		if(num_instances > 1)
			shader.drawInstanced( mesh, material.primitive === undefined ? gl.TRIANGLES : material.primitive, index_buffer_name, instancing_uniforms );
		else if(group)
			shader.drawRange( mesh, material.primitive, group.start, group.length, index_buffer_name );
		else
			shader.draw( mesh, material.primitive, index_buffer_name );
		gl.colorMask(true,true,true,true);
		gl.depthFunc( gl.LEQUAL );
		//gl.frontFace( reverse_faces ? gl.CW : gl.CCW );
		this.rendered_render_calls++;
	}

	if(num_instances > 1)
	{
		if(group)
			shader.drawInstanced( mesh, material.primitive === undefined ? gl.TRIANGLES : material.primitive, index_buffer_name, instancing_uniforms, group.start, group.length );
		else
			shader.drawInstanced( mesh, material.primitive === undefined ? gl.TRIANGLES : material.primitive, index_buffer_name, instancing_uniforms );
	}
	else
	{
		if(group)
			shader.drawRange( mesh, material.primitive, group.start, group.length, index_buffer_name );
		else
			shader.draw( mesh, material.primitive, index_buffer_name );
	}
	this.rendered_render_calls++;

	renderer.disableItemFlags( material );
	if( reverse_faces )
		gl.frontFace( GL.CCW );

	gl.depthFunc( gl.LESS );
	gl.depthMask( true );
}

PBRPipeline.prototype.renderDeferred = function( nodes, camera, skip_fbo, layers )
{
	//TODO

	//setup GBuffers
	var GB = this.prepareBuffers();

	//render to GBuffers
	GB.fbo.bind();
	this.renderToGBuffers( nodes, camera, layers );
	GB.fbo.unbind();

	GB.final_fbo.bind();

	//get  lights
	var lights = this.gatherLightsFromNodes( nodes, layers );

	//apply lights
	this.renderFinalPass(GB, lights, camera);
	
	//render blend objects in forward reusing forward pipeline
	//...

	GB.final_fbo.unbind();

	//apply FX
	this.applyPostFX( GB );
}

PBRPipeline.prototype.prepareBuffers = function( camera )
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
	var options = { format: GL.RGBA, minFilter: gl.NEAREST, magFilter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE };
	var albedo = new GL.Texture(w,h,options); //albedo, back?
	var matprop = new GL.Texture(w,h,options); //metalness, roughness, selfocclusion, mat_id
	var emissive = new GL.Texture(w,h,options); //emissive + lightmap, exp
	var normal = new GL.Texture(w,h,options); //normal, 
	var depth = new GL.Texture(w,h,{ format: GL.DEPTH_STENCIL, type: GL.UNSIGNED_INT_24_8_WEBGL }); //depth stencil
	var final_buffer = new GL.Texture(w,h,{ format: GL.RGB, type: gl.HIGH_PRECISION_FORMAT, magFilter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE });
	GB.fbo.setTextures([ albedo, matprop, emissive, normal ], depth );
	GB.final_fbo.setTextures([final_buffer]);
	GB.albedo = albedo;
	GB.matprop = matprop;
	GB.emissive = emissive;
	GB.normal = normal;
	GB.width = w;
	GB.height = h;

	return GB;
}

PBRPipeline.prototype.renderToGBuffers = function( nodes, camera, layers )
{
	var rcs = this.getAllRenderCalls( nodes, camera, layers );

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
	for(var i = 0; i < rcs.length; ++i)
	{
		var rc = rcs[i];
		if(rc.material.overlay && this.allow_overlay )
		{
			overlay_rcs.push(rc);
			continue;
		}

		//in case of instancing
		var model = rc.model;
		if( rc._instancing && rc._instancing.length )
			model = GL.linearizeArray( rc._instancing, Float32Array );

		//render opaque stuff
		this.renderMeshWithMaterialToGBuffers( model, rc.mesh, rc.material, rc.index_buffer_name, rc.group_index, rc.node.extra_uniforms, rc.reverse_faces, rc.skin );
	}
}

PBRPipeline.prototype.renderFinalPass = function( GB, lights, camera )
{
	//for every light...

	GB.albedo.toViewport();
}

PBRPipeline.prototype.applyPostFX = function( GB )
{
	gl.disable( GL.DEPTH_TEST );
	gl.disable( GL.BLEND );
	var w = GB.width;
	var h = GB.height;

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

PBRPipeline.prototype.gatherLightsFromNodes = function( nodes, layers )
{

}

PBRPipeline.prototype.renderMeshWithMaterialToGBuffers = function( model_matrix, mesh, material, index_buffer_name, group_index, extra_uniforms, reverse_faces, skinning_info )
{
	var renderer = this.renderer;

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
	material_uniforms.u_emissive[3] = material.emissive_clamp_to_edge ? 1 : 0; //clamps to black
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

	if(num_instances > 1)
	{
		if(group)
			shader.drawInstanced( mesh, material.primitive === undefined ? gl.TRIANGLES : material.primitive, index_buffer_name, instancing_uniforms, group.start, group.length );
		else
			shader.drawInstanced( mesh, material.primitive === undefined ? gl.TRIANGLES : material.primitive, index_buffer_name, instancing_uniforms );
	}
	else
	{
		if(group)
			shader.drawRange( mesh, material.primitive, group.start, group.length, index_buffer_name );
		else
			shader.draw( mesh, material.primitive, index_buffer_name );
	}
	this.rendered_render_calls++;

	renderer.disableItemFlags( material );
	if( reverse_faces )
		gl.frontFace( GL.CCW );

	gl.depthFunc( gl.LESS );
	gl.depthMask( true );
}


// ********************************************************

PBRPipeline.prototype.getRenderCallFromPool = function()
{
	if( this.used_render_calls < this.render_calls_pool.length )
	{
		var rc = this.render_calls_pool[this.used_render_calls];
		this.used_render_calls++;
		return rc;
	}

	var rc = new RD.RenderCall();
	rc.id = this.used_render_calls;
	this.render_calls_pool.push( rc );
	this.used_render_calls++;
	return rc;
}

PBRPipeline.prototype.resetRenderCallsPool = function()
{
	this.used_render_calls = 0;
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
	if(!texture || texture.texture_type !== GL.TEXTURE_CUBE_MAP)
		return;

	gl.disable( gl.CULL_FACE );
	gl.disable( gl.DEPTH_TEST );
	gl.disable( gl.BLEND );
	var model = this.renderer._model_matrix;
	mat4.identity( model );
	mat4.translate( model, model, camera.position );
	mat4.scale( model, model, [10,10,10] ); //to avoid overlaps
	this.renderer.setModelMatrix(model);
	shader.uniforms( this.renderer._uniforms );
	shader.uniforms({
		u_color_texture: texture.bind(1), //u_SpecularEnvSampler_texture uses also 1
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
	this.skin = null; //could be RD.Skeleton or { bindMatrices:[], joints:[], skeleton_root }

	this._instancing = null;
	this.node = null;
	this._render_priority = 0;
}

var temp_vec3 = vec3.create();

RenderCall.prototype.copyFrom = function( rc )
{
	this.name = rc.name;
	this.id = rc.id;
	this.mesh = rc.mesh;
	this.model = rc.model;
	this.index_buffer_name = rc.index_buffer_name;
	this.group_index = rc.group_index;
	this.material = rc.material;
	this.reverse_faces = rc.reverse_faces;
	this.node = rc.node;
	this.skin = rc.skin;
	this._instancing = rc._instancing;

	this._render_priority = rc._render_priority;
}

RenderCall.prototype.computeRenderPriority = function( point )
{
	this.name = this.node.name;
	var bb = this.mesh.getBoundingBox();
	if(!bb)
		return;
	var pos = mat4.multiplyVec3( temp_vec3, this.model, bb );
	this._render_priority = this.material.render_priority || 0;
	var dist = vec3.distance( point, pos );
	if(this.material.alphaMode == "BLEND")
	{
		this._render_priority += dist * 0.001;
		this._render_priority -= 100;
	}
	else
	{
		this._render_priority += 1000 - dist * 0.001; //sort backwards
	}
}

RD.PBRPipeline = PBRPipeline;
RD.RenderCall = RenderCall;

})(this);