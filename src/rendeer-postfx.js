	//Independent glow FX
	//based on https://catlikecoding.com/unity/tutorials/advanced-rendering/bloom/
	function FXGlow()
	{
		this.intensity = 0.5;
		this.persistence = 0.6;
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
		iterations = clamp(iterations, 1, 16) | 0;
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
		if ( output_texture ) {
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
		}

		GL.Texture.releaseTemporary(currentSource);
	};

	FXGlow.cut_pixel_shader =
		"precision highp float;\n\
	varying vec2 v_coord;\n\
	uniform sampler2D u_texture;\n\
	uniform float u_threshold;\n\
	void main() {\n\
		gl_FragColor = max( texture2D( u_texture, v_coord ) - vec4( u_threshold ), vec4(0.0) );\n\
	}";

	FXGlow.scale_pixel_shader =
		"precision highp float;\n\
	varying vec2 v_coord;\n\
	uniform sampler2D u_texture;\n\
	uniform vec2 u_texel_size;\n\
	uniform float u_delta;\n\
	uniform float u_intensity;\n\
	\n\
	vec4 sampleBox(vec2 uv) {\n\
		vec4 o = u_texel_size.xyxy * vec2(-u_delta, u_delta).xxyy;\n\
		vec4 s = texture2D( u_texture, uv + o.xy ) + texture2D( u_texture, uv + o.zy) + texture2D( u_texture, uv + o.xw) + texture2D( u_texture, uv + o.zw);\n\
		return s * 0.25;\n\
	}\n\
	void main() {\n\
		gl_FragColor = u_intensity * sampleBox( v_coord );\n\
	}";

	FXGlow.final_pixel_shader =
		"precision highp float;\n\
	varying vec2 v_coord;\n\
	uniform sampler2D u_texture;\n\
	uniform sampler2D u_glow_texture;\n\
	#ifdef USE_DIRT\n\
		uniform sampler2D u_dirt_texture;\n\
	#endif\n\
	uniform vec2 u_texel_size;\n\
	uniform float u_delta;\n\
	uniform float u_intensity;\n\
	uniform float u_dirt_factor;\n\
	\n\
	vec4 sampleBox(vec2 uv) {\n\
		vec4 o = u_texel_size.xyxy * vec2(-u_delta, u_delta).xxyy;\n\
		vec4 s = texture2D( u_glow_texture, uv + o.xy ) + texture2D( u_glow_texture, uv + o.zy) + texture2D( u_glow_texture, uv + o.xw) + texture2D( u_glow_texture, uv + o.zw);\n\
		return s * 0.25;\n\
	}\n\
	void main() {\n\
		vec4 glow = sampleBox( v_coord );\n\
		#ifdef USE_DIRT\n\
			glow = mix( glow, glow * texture2D( u_dirt_texture, v_coord ), u_dirt_factor );\n\
		#endif\n\
		gl_FragColor = texture2D( u_texture, v_coord ) + u_intensity * glow;\n\
	}";