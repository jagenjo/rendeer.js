/* This is an example of how a light could be coded */
(function(global){

	function Light()
	{
		this.intensity = 1;
		this._color = vec3.fromValues(0.9,0.9,0.9);
		this._position = vec3.fromValues(10,20,5);
		this._target = vec3.create();
		this._vector = vec3.create(); //light direction (from light to scene)

		this.camera = new RD.Camera(); //for shadowmaps and projective textures

		this._castShadows = false;

		this.shadowmap = {
			texture:null,
			resolution: 2048,
			bias: 0.000005,
			uniforms: {
				u_shadowmap_matrix: this.camera._viewprojection_matrix,
				u_shadowmap_texture: 4,
				u_shadowbias: 0.00001
			}
		};

		this.uniforms = {
			u_light_position: this._position,
			u_light_color: vec3.create(),
			u_light_vector: this._vector,
		};

		this.flags = {
			skip_shadows: false	
		};
	}

	Object.defineProperty( Light.prototype, "color", {
		set: function(v){
			this._color.set(v);
		},
		get: function() { return this._color; },
		enumerable: true
	});

	Object.defineProperty( Light.prototype, "castShadows", {
		set: function(v){
			if(v)
				this.enableShadows();
			else
				this.disableShadows();
		},
		get: function() { return this._castShadows; },
		enumerable: true
	});

	Light.DEFAULT_SHADOWMAP_RESOLUTION = 2048;

	Light.prototype.updateData = function()
	{
		vec3.sub( this._vector, this._target, this._position );
		vec3.normalize(this._vector, this._vector);
	}

	Light.prototype.setUniforms = function( shader )
	{
		this.shadowmap.uniforms.u_shadowbias = this.shadowmap.bias;
		this.uniforms.u_light_color.set( this._color );
		vec3.scale( this.uniforms.u_light_color, this.uniforms.u_light_color, this.intensity );
		shader.uniforms(this.uniforms);
		shader.uniforms(this.shadowmap.uniforms);
		if(this._castShadows)
			this.shadowmap.texture.bind(this.shadowmap.uniforms.u_shadowmap_texture);
	}

	Light.prototype.lookAt = function(eye, center, up) {
		this._position.set(eye);
		this._target.set(center);
		this.camera.lookAt( eye, center, up );
		this.updateData();
	};

	Light.prototype.setView = function(area,near,far) {
		this.camera.orthographic(area,near,far,1);
		this.updateData();
	};

	Light.prototype.followCamera = function(camera, viewsize) {
		var size = viewsize || 5;
		
		var offset = vec3.scaleAndAdd( vec3.create(), camera.target, this._vector, -viewsize );
		this.lookAt( offset, camera.target, camera.up );
		this.camera.orthographic(size,0.01,size*3,1);
		this.camera.updateMatrices();
	}

	Light.prototype.enableShadows = function()
	{
		this._castShadows = true;
		var res = this.shadowmap.resolution || Light.DEFAULT_SHADOWMAP_RESOLUTION;
		if(!this.shadowmap.texture || this.shadowmap.texture.width != res)
		{
			this.shadowmap.texture = new GL.Texture( res,res, { format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT, filter: gl.NEAREST }),
			this.shadowmap.fbo = new GL.FBO( null, this.shadowmap.texture );
		}
	}

	Light.prototype.disableShadows = function()
	{
		this._castShadows = false;
		this.shadowmap.texture = null;
		this.shadowmap.fbo = null;
	}

	Light.prototype.generateShadowmap = function(renderer, scene, layers)
	{
		if(!this.castShadows)
			return;

		if(!this.shadowmap.fbo)
			throw("no shadowmap fbo");

		renderer.generating_shadowmap = true;
		this.shadowmap.fbo.bind();
			gl.clear( gl.DEPTH_BUFFER_BIT );
			renderer.shader_overwrite = "flat"; //what about skinning?
			if(scene.constructor === Array)
			{
				for(var i = 0; i < scene.length; ++i)
					renderer.render( scene[i], this.camera, null, layers || 0xFF );
			}
			else
				renderer.render( scene, this.camera, null, layers || 0xFF );
			renderer.shader_overwrite = null;
		this.shadowmap.fbo.unbind();
		renderer.generating_shadowmap = false;
		this.shadowmap.texture.bind(4);
	}

	Light.prototype.renderNode = function(renderer,camera)
	{
		if(!gl.meshes["cylinder_light"])
		{
			gl.meshes["cylinder_light"] = GL.Mesh.cylinder({radius:0.02,height:1});
			gl.meshes["cone_light"] = GL.Mesh.cone({radius:0.1,height:0.25});
		}
	}

	RD.Light = Light;

})(this);