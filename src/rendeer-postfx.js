	//Independent glow FX
	//based on https://catlikecoding.com/unity/tutorials/advanced-rendering/bloom/
	function FXGlow()
	{
		this.intensity = 1;
		this.persistence = 1;
		this.iterations = 8;
		this.threshold = 0.8;
		this.scale = 1;

		this.dirt_texture = null;
		this.dirt_factor = 0.5;

		this._textures = [];
		this._uniforms = {
			u_intensity: 1,
			u_texture: 0,
			u_glow_texture: 1,
			u_threshold: 0,
			u_texel_size: vec2.create()
		};
	}

	FXGlow.prototype.applyFX = function( tex, output_texture, glow_texture, average_texture ) {

		var width = tex.width;
		var height = tex.height;

		var texture_info = {
			format: tex.format,
			type: tex.type,
			minFilter: GL.LINEAR,
			magFilter: GL.LINEAR,
			wrap: gl.CLAMP_TO_EDGE
		};

		var uniforms = this._uniforms;
		var textures = this._textures;

		//cut
		var shader = FXGlow._cut_shader;
		if (!shader) {
			shader = FXGlow._cut_shader = new GL.Shader(
				GL.Shader.SCREEN_VERTEX_SHADER,
				FXGlow.cut_pixel_shader
			);
		}

		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);

		uniforms.u_threshold = this.threshold;
		var currentDestination = (textures[0] = GL.Texture.getTemporary(
			width,
			height,
			texture_info
		));
		tex.blit( currentDestination, shader.uniforms(uniforms) );
		var currentSource = currentDestination;

		var iterations = this.iterations;
		iterations = Math.clamp(iterations, 1, 16) | 0;
		var texel_size = uniforms.u_texel_size;
		var intensity = this.intensity;

		uniforms.u_intensity = 1;
		uniforms.u_delta = this.scale; //1

		//downscale/upscale shader
		var shader = FXGlow._shader;
		if (!shader) {
			shader = FXGlow._shader = new GL.Shader(
				GL.Shader.SCREEN_VERTEX_SHADER,
				FXGlow.scale_pixel_shader
			);
		}

		var i = 1;
		//downscale
		for (; i < iterations; i++) {
			width = width >> 1;
			if ((height | 0) > 1) {
				height = height >> 1;
			}
			if (width < 2) {
				break;
			}
			currentDestination = textures[i] = GL.Texture.getTemporary(
				width,
				height,
				texture_info
			);
			texel_size[0] = 1 / currentSource.width;
			texel_size[1] = 1 / currentSource.height;
			currentSource.blit(
				currentDestination,
				shader.uniforms(uniforms)
			);
			currentSource = currentDestination;
		}

		//average
		if (average_texture) {
			texel_size[0] = 1 / currentSource.width;
			texel_size[1] = 1 / currentSource.height;
			uniforms.u_intensity = intensity;
			uniforms.u_delta = 1;
			currentSource.blit(average_texture, shader.uniforms(uniforms));
		}

		//upscale and blend
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		uniforms.u_intensity = this.persistence;
		uniforms.u_delta = 0.5;

		// i-=2 => -1 to point to last element in array, -1 to go to texture above
		for ( i -= 2; i >= 0; i-- ) 
		{
			currentDestination = textures[i];
			textures[i] = null;
			texel_size[0] = 1 / currentSource.width;
			texel_size[1] = 1 / currentSource.height;
			currentSource.blit(
				currentDestination,
				shader.uniforms(uniforms)
			);
			GL.Texture.releaseTemporary(currentSource);
			currentSource = currentDestination;
		}
		gl.disable(gl.BLEND);

		//glow
		if (glow_texture) {
			currentSource.blit(glow_texture);
		}

		//final composition
		if ( !output_texture )
		{
			if(!FXGlow._final_shader)
				FXGlow._final_shader = new GL.Shader(GL.Shader.SCREEN_VERTEX_SHADER,FXGlow.final_pixel_shader);

			gl.disable(gl.BLEND);
			tex.bind(0);
			currentSource.bind(1);
			FXGlow._final_shader.toViewport(uniforms);
			GL.Texture.releaseTemporary(currentSource);
			gl.disable(gl.BLEND);
			return;
		}

		var final_texture = output_texture;
		var dirt_texture = this.dirt_texture;
		var dirt_factor = this.dirt_factor;
		uniforms.u_intensity = intensity;

		shader = dirt_texture
			? FXGlow._dirt_final_shader
			: FXGlow._final_shader;
		if (!shader) {
			if (dirt_texture) {
				shader = FXGlow._dirt_final_shader = new GL.Shader(
					GL.Shader.SCREEN_VERTEX_SHADER,
					FXGlow.final_pixel_shader,
					{ USE_DIRT: "" }
				);
			} else {
				shader = FXGlow._final_shader = new GL.Shader(
					GL.Shader.SCREEN_VERTEX_SHADER,
					FXGlow.final_pixel_shader
				);
			}
		}

		final_texture.drawTo(function() {
			tex.bind(0);
			currentSource.bind(1);
			if (dirt_texture) {
				shader.setUniform("u_dirt_factor", dirt_factor);
				shader.setUniform(
					"u_dirt_texture",
					dirt_texture.bind(2)
				);
			}
			shader.toViewport(uniforms);
		});

		GL.Texture.releaseTemporary(currentSource);
	};

	FXGlow.cut_pixel_shader =
	`precision highp float;
	varying vec2 v_coord;
	uniform sampler2D u_texture;
	uniform float u_threshold;
	void main() {
		gl_FragColor = max( texture2D( u_texture, v_coord ) - vec4( u_threshold ), vec4(0.0) );
	}`;

	FXGlow.scale_pixel_shader =
	`precision highp float;
	varying vec2 v_coord;
	uniform sampler2D u_texture;
	uniform vec2 u_texel_size;
	uniform float u_delta;
	uniform float u_intensity;
	
	vec4 sampleBox(vec2 uv) {
		vec4 o = u_texel_size.xyxy * vec2(-u_delta, u_delta).xxyy;
		vec4 s = texture2D( u_texture, uv + o.xy ) + texture2D( u_texture, uv + o.zy) + texture2D( u_texture, uv + o.xw) + texture2D( u_texture, uv + o.zw);
		return s * 0.25;
	}
	void main() {
		gl_FragColor = u_intensity * sampleBox( v_coord );
	}`;

	FXGlow.final_pixel_shader = `
	precision highp float;
	varying vec2 v_coord;
	uniform sampler2D u_texture;
	uniform sampler2D u_glow_texture;
	#ifdef USE_DIRT
		uniform sampler2D u_dirt_texture;
	#endif
	uniform vec2 u_texel_size;
	uniform float u_delta;
	uniform float u_intensity;
	uniform float u_dirt_factor;
	
	vec4 sampleBox(vec2 uv) {
		vec4 o = u_texel_size.xyxy * vec2(-u_delta, u_delta).xxyy;
		vec4 s = texture2D( u_glow_texture, uv + o.xy ) + texture2D( u_glow_texture, uv + o.zy) + texture2D( u_glow_texture, uv + o.xw) + texture2D( u_glow_texture, uv + o.zw);
		return s * 0.25;
	}
	void main() {
		vec4 glow = sampleBox( v_coord );
		#ifdef USE_DIRT
			glow = mix( glow, glow * texture2D( u_dirt_texture, v_coord ), u_dirt_factor );
		#endif
		gl_FragColor = texture2D( u_texture, v_coord ) + u_intensity * glow;
	}`;

	//Saturation, Contrast, Brightness ********************************
	function FXColorCorrection()
	{
		this.contrast = 1;
		this.brightness = 1;
		this.saturation = 1;

		this._uniforms = {
			u_texture: 0,
			u_contrast: 1,
			u_brightness: 1,
			u_saturation: 1,
			u_quantization: 0,
			u_texel_size: vec2.create()
		};
	}

	FXColorCorrection.prototype.applyFX = function( tex, output_texture ) {

		var width = tex.width;
		var height = tex.height;

		var uniforms = this._uniforms;

		//cut
		var shader = FXColorCorrection._shader;
		if (!shader) {
			shader = FXColorCorrection._shader = new GL.Shader(
				GL.Shader.SCREEN_VERTEX_SHADER,
				FXColorCorrection.pixel_shader
			);
		}

		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);

		uniforms.u_contrast = this.contrast;
		uniforms.u_brightness = this.brightness;
		uniforms.u_saturation = this.saturation;

		//final composition
		if ( !output_texture )
		{
			tex.bind(0);
			shader.toViewport(uniforms);
			return;
		}

		output_texture.drawTo(function() {
			tex.bind(0);
			shader.toViewport(uniforms);
		});

	};

	FXColorCorrection.pixel_shader =
	`precision highp float;
	varying vec2 v_coord;
	uniform sampler2D u_texture;
	uniform float u_contrast;
	uniform float u_brightness;
	uniform float u_saturation;
	void main() {
		vec4 color = texture2D( u_texture, v_coord );
		color.xyz = (color.xyz - vec3(0.5)) * u_contrast + vec3(0.5);
		color.xyz *= u_brightness;
		vec3 mid = vec3(color.x + color.y + color.z) / 3.0;
		color.xyz = mix( mid, color.xyz, u_saturation );
		gl_FragColor = color;
	}`;

	