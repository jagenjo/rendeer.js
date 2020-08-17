(function(global){
var RD = global.RD;

//Adds a pipeline to render in PBR
//It supports rendering in deferred mode or forward mode
function PBRPipeline( renderer )
{
	this.renderer = renderer;
	renderer.pipeline = this;
	this.mode = PBRPipeline.FORWARD;
	this.fbo = null;
	this.bgcolor = vec4.fromValues(0.1,0.1,0.1,1.0);
	this.environment_texture = null;
	this.environment_sh_coeffs = null;
	this.environment_rotation = 180;
	this.environment_factor = 1;
	this.exposure = 1;

	this.resolution_factor = 1;

	this.use_rendertexture = true;
	this.fx = null;

	//this.overwrite_shader_name = "normal";

	this.global_uniforms = {
		u_brdf_texture: 0,
		u_exposure: this.exposure,
		u_SpecularEnvSampler_texture: 1,
		u_skybox_mipCount: 5,
		u_skybox_info: [ this.environment_rotation, this.environment_factor ]
    };

	this.material_uniforms = {
		u_albedo: vec3.fromValues(1,1,1),
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

	this.fx_uniforms = {
		u_viewportSize: vec2.create(),
		u_iViewportSize: vec2.create()
	};


	this.final_texture = null; //HDR image that contains the final scene before tonemapper
	this.final_fbo = null;

	this.render_calls = [];
	this.num_render_calls = 0;
}

PBRPipeline.FORWARD = 1;
PBRPipeline.DEFERRED = 2;

PBRPipeline.maps = ["albedo","metallicRoughness","occlusion","normal","emissive","opacity","displacement"];

PBRPipeline.prototype.render = function( nodes, camera, scene )
{
	//prepare generic
	this.fillGlobalUniforms();

	if(this.mode == PBRPipeline.FORWARD)
		this.renderForward( nodes, camera, scene );
	else if(this.mode == PBRPipeline.DEFERRED)
		this.renderDeferred( nodes, camera, scene );

	//gl.viewport(0,0,256,256);
	//brdf_tex.toViewport();
	//gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
}

//gathers uniforms that do not change between rendered objects
PBRPipeline.prototype.fillGlobalUniforms = function()
{
	var brdf_tex = this.getBRDFIntegratorTexture();
	if(brdf_tex)
		brdf_tex.bind( 0 );
	if(this.environment_texture)
		this.environment_texture.bind(1);
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
}

PBRPipeline.prototype.renderForward = function( nodes, camera, scene )
{
	//prepare buffers
	var w = gl.viewport_data[2] * this.resolution_factor;
	var h = gl.viewport_data[3] * this.resolution_factor;

	if(this.use_rendertexture)
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

	//render skybox
	if(this.environment_texture)
		this.renderSkybox(camera);

	this.resetRenderCallsPool();	

	//extract render calls
	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		this.getNodesRenderCalls( node );
	}

	//sort by alpha
	var rcs = this.render_calls.slice(0,this.num_render_calls);
	rcs = rcs.sort( PBRPipeline.rc_sort_function );

	//render rcs
	for(var i = 0; i < rcs.length; ++i)
	{
		var rc = rcs[i];
		this.renderMeshWithMaterial( rc.model, rc.mesh, rc.material, rc.index_buffer_name, rc.group_index );
	}


	if(this.use_rendertexture)
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
		this.final_texture.toViewport( gl.shaders["tonemapper"], this.fx_uniforms );
	}
}

PBRPipeline.prototype.getNodesRenderCalls = function( node )
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

	//prepare matrix
	node.updateGlobalMatrix(true);

	if( node.primitives )
	{
		if(!mesh)
			return;
		for(var i = 0; i < node.primitives.length; ++i)
		{
			var prim = node.primitives[i];
			var material = RD.Materials[ prim.material ];
			if(material)
			{
				var rc = this.getRenderCallFromPool();
				rc.material = material;
				rc.model = node._global_matrix;
				rc.mesh = mesh;
				rc.group_index = i;
				rc.node = node;
			}
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
		}
	}
}

//places semitransparent meshes the last ones
PBRPipeline.rc_sort_function = function(a,b)
{
	if(a.material.alphaMode == "BLEND" && b.material.alphaMode == "BLEND")
		return 0;
	if(a.material.alphaMode == "BLEND" && b.material.alphaMode != "BLEND" )
		return 1;
	if(a.material.alphaMode != "BLEND" && b.material.alphaMode == "BLEND" )
		return -1;
	return 0;
}

PBRPipeline.prototype.renderMeshWithMaterial = function( model, mesh, material, index_buffer_name, group_index )
{
	var renderer = this.renderer;

	var shader = null;

	var material_uniforms = this.material_uniforms;
	var sampler_uniforms = this.sampler_uniforms;

	//materials
	material_uniforms.u_albedo = material.color.subarray(0,3);
	var shader_name = null;
	if( material.model == "pbrMetallicRoughness")
	{
		shader_name = "pbr";
		material_uniforms.u_metalness = material.metallicFactor;
		material_uniforms.u_roughness = material.roughnessFactor;
		material_uniforms.u_emissive = material.emissive;
	}
	else
		shader_name = "texture";
	var shader = gl.shaders[ this.overwrite_shader_name || shader_name ];
	if(!shader)
		return;

	material_uniforms.u_alpha = material.opacity;
	material_uniforms.u_alpha_cutoff = -1; //disabled

	//textures
	var slot = 2; //skip 0 and 1 as are in use
	var maps_info = material_uniforms.u_maps_info;
	for(var i = 0; i < PBRPipeline.maps.length; ++i)
	{
		var map = PBRPipeline.maps[i];
		maps_info[i] = -1;
		var texture_name = material.textures[ map ];
		if(!texture_name)
			continue;
		if( texture_name.constructor === Object ) //in case it has properties for this channel
			texture_name = texture_name.texture;
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

		sampler_uniforms[ texture_uniform_name ] = texture.bind( slot++ );
		maps_info[i] = 0;
	}

	material_uniforms.u_metallicRough = Boolean(material.textures["metallicRoughness"]);

	//flags
	renderer.enableItemFlags( material );

	if(material.alphaMode == "BLEND")
	{
		gl.enable(gl.BLEND);
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
	shader.uniforms( this.global_uniforms ); //locals
	shader.uniforms( material_uniforms ); //locals
	shader.uniforms( sampler_uniforms ); //locals

	var group = null;
	if( group_index != null && mesh.info && mesh.info.groups && mesh.info.groups[ group_index ] )
		group = mesh.info.groups[ group_index ];

	if(group)
		shader.drawRange( mesh, material.primitive, group.start, group.length, index_buffer_name );
	else
		shader.draw( mesh, material.primitive, index_buffer_name );

	renderer.disableItemFlags( material );
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
	this.num_render_calls = 0;
}

PBRPipeline.prototype.renderSkybox = function( camera )
{
	var mesh = gl.meshes["cube"];
	var shader = gl.shaders[ this.overwrite_shader_name || "skybox" ];
	if(!shader)
		return;
	gl.disable( gl.CULL_FACE );
	gl.disable( gl.DEPTH_TEST );
	var model = this.renderer._model_matrix;
	mat4.identity( model );
	mat4.translate( model, model, camera.position );
	mat4.scale( model, model, [10,10,10] );
	this.renderer.setModelMatrix(model);
	shader.uniforms( this.renderer._uniforms );
	shader.uniforms({
		u_color_texture: this.environment_texture.bind(0),
		u_is_rgbe: false,
		u_mipmap_offset: 0,
		u_rotation: this.environment_rotation * DEG2RAD,
		u_camera_position: camera.position
	});
	shader.draw(mesh,GL.TRIANGLES);
}

PBRPipeline.prototype.loadEnvironment = function( url, callback )
{
	var that = this;
	HDRE.load(url, function(data){
		that.environment_sh_coeffs = data.shs ? data.shs : null;
		var tex = HDRE.toTexture(data);
		if(tex)
			that.environment_texture = tex;
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
	
	//var shader = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, HDRTool.BRDF_FSHADER );
	var shader = gl.shaders["brdf_integrator"];
	if(!shader)
		return;

	var hammersley_tex = gl.textures["hammersley_sample_texture"];
	if(!hammersley_tex)
		hammersley_tex = this.createHammersleySampleTexture();

	tex.drawTo(function(texture) {
		if(hammersley_tex)
			hammersley_tex.bind(0);
		shader.uniforms({		
			u_hammersley_sample_texture: 0
		}).draw( GL.Mesh.getScreenQuad(), gl.TRIANGLES );

		if(hammersley_tex)
			hammersley_tex.unbind();
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
	this.id = -1;
	this.priority = 0;
	this.mesh = null;
	this.model = null;
	this.index_buffer_name = "triangles";
	this.group_index = -1;
	this.material = null;
	this.node = null;
}

RD.PBRPipeline = PBRPipeline;
RD.RenderCall = RenderCall;

})(this);