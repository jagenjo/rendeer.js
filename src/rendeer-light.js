/* This is an example of how a light could be coded */
(function(global){

	class Light 
	{
		static DEFAULT_SHADOWMAP_RESOLUTION = 2048;

		constructor()
		{
			this.intensity = 1;
			this.area = 1; //frustum
			this._color = vec3.fromValues(0.9,0.9,0.9);
			this._position = vec3.fromValues(10,20,5);
			this._target = vec3.create();
			this._vector = vec3.create(); //light direction (from light to scene)

			this.camera = new RD.Camera(); //for shadowmaps and projective textures

			this._castShadows = false;

			this.shadowmap = {
				texture:null,
				resolution: 2048,
				bias: 0.00001,
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

	set color(v){
			this._color.set(v);
	}
	get color() { return this._color; }

	set castShadows(v){
			if(v)
				this.enableShadows();
			else
				this.disableShadows();
	}
	get castShadows() { return this._castShadows; }

	updateData()
	{
		vec3.sub( this._vector, this._target, this._position );
		vec3.normalize(this._vector, this._vector);
	}

	setUniforms( shader_or_uniforms )
	{
		this.shadowmap.uniforms.u_shadowbias = this.shadowmap.bias;
		this.uniforms.u_light_color.set( this._color );
		vec3.scale( this.uniforms.u_light_color, this.uniforms.u_light_color, this.intensity );

		if(shader_or_uniforms.constructor === GL.Shader )
		{
			var shader = shader_or_uniforms;
			shader.uniforms(this.uniforms);
			if(this._castShadows)
			{
				shader.uniforms(this.shadowmap.uniforms);
				this.shadowmap.texture.bind(this.shadowmap.uniforms.u_shadowmap_texture);
			}
		}
		else
		{
			var uniforms = shader_or_uniforms;
			for(var i in this.uniforms)
				uniforms[i] = this.uniforms[i];
			if(this._castShadows)
				for(var i in this.shadowmap.uniforms)
					uniforms[i] = this.shadowmap.uniforms[i];
		}
	}

	lookAt(eye, center, up) {
		this._position.set(eye);
		this._target.set(center);
		this.camera.lookAt( eye, center, up );
		this.updateData();
	}

	setView(area,near,far) {
		this.area = area;
		this.camera.orthographic(area,near,far,1);
		this.updateData();
	}

	followCamera(camera, viewsize) {
		var size = viewsize || 5;
		
		var offset = vec3.scaleAndAdd( vec3.create(), camera.target, this._vector, -viewsize );
		this.lookAt( offset, camera.target, camera.up );
		this.camera.orthographic(size,0.01,size*3,1);
		this.camera.updateMatrices();
	}

	enableShadows()
	{
		this._castShadows = true;
		var res = this.shadowmap.resolution || Light.DEFAULT_SHADOWMAP_RESOLUTION;
		if(!this.shadowmap.texture || this.shadowmap.texture.width != res)
		{
			this.shadowmap.texture = new GL.Texture( res,res, { format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT, filter: gl.NEAREST }),
			this.shadowmap.fbo = new GL.FBO( null, this.shadowmap.texture );
		}
	}

	disableShadows()
	{
		this._castShadows = false;
		this.shadowmap.texture = null;
		this.shadowmap.fbo = null;
	}

	generateShadowmap(renderer, scene, layers)
	{
		if(!this.castShadows)
			return;

		if(!this.shadowmap.fbo)
			throw("no shadowmap fbo");

		this.camera.view_texel_grid = [this.shadowmap.resolution,this.shadowmap.resolution];

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
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
	}

	/*
	Light.prototype.renderNode = function(renderer,camera)
	{
		if(!gl.meshes["cylinder_light"])
		{
			gl.meshes["cylinder_light"] = GL.Mesh.cylinder({radius:0.02,height:1});
			gl.meshes["cone_light"] = GL.Mesh.cone({radius:0.1,height:0.25});
		}
	}
	*/

	static shadow_shader_function = `uniform mat4 u_shadowmap_matrix;
	uniform sampler2D u_shadowmap_texture;
	
	float testShadowmap( vec3 pos )
	{
		const float bias = 0.004;
		vec4 proj = u_shadowmap_matrix * vec4(pos, 1.0);
		vec2 sample = (proj.xy / proj.w) * vec2(0.5) + vec2(0.5);
		if(sample.x >= 0.0 && sample.x <= 1.0 && sample.y >= 0.0 && sample.y <= 1.0 )
		{
			float depth = texture2D( u_shadowmap_texture, sample ).x;
			if( depth > 0.0 && depth < 1.0 && depth <= ( ((proj.z-bias) / proj.w) * 0.5 + 0.5) )
				return 0.0;
		}
		return 1.0;
	}`	;
}

RD.Light = Light;

})(typeof(window) != "undefined" ? window : (typeof(self) != "undefined" ? self : global ));