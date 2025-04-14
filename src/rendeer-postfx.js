	//Independent glow FX
	//based on https://catlikecoding.com/unity/tutorials/advanced-rendering/bloom/
	class FXGlow
	{
		intensity = 1;
		persistence = 1;
		iterations = 8;
		threshold = 0.8;
		scale = 1;

		dirt_texture = null;
		dirt_factor = 0.5;

		constructor()
		{
			this._textures = [];
			this._uniforms = {
				u_intensity: 1,
				u_texture: 0,
				u_glow_texture: 1,
				u_threshold: 0,
				u_texel_size: vec2.create()
			};
		}
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
	class FXColorCorrection
	{
		contrast = 1;
		brightness = 1;
		saturation = 1;

		constructor()
		{
			this._uniforms = {
				u_texture: 0,
				u_contrast: 1,
				u_brightness: 1,
				u_saturation: 1,
				u_quantization: 0,
				u_texel_size: vec2.create()
			};
		}
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

class FXSSAO
{

	constructor()
	{
		this.properties = {
			enable: false,
			blur: true,
			radius: 0.25,
			bias: 0.001,
			max_dist: 3,
			min_dist: 0.025,
			power: 1
		};

		this.kernel = FXSSAO.generateSampleKernel( 64 );
		if(!FXSSAO.noise_texture)
			FXSSAO.noise_texture = FXSSAO.generateNoiseTexture( 4 );

		this.uniforms = {
			u_samples: this.kernel,
			u_radius: this.properties.radius,
			u_bias: this.properties.bias,
			u_max_dist: this.properties.max_dist,
			u_min_dist: this.properties.min_dist,
			u_ao_power: this.properties.power,
			u_iresolution: vec2.create(),
			u_noise_scale: vec2.create(),
			u_invvp: mat4.create(),
			u_linear_depth: 0
		};
	}
}

FXSSAO.prototype.getShader = function()
{
	if (this.shader)
		return this.shader;
	var extra = gl.webgl_version == 1 ? `#extension GL_EXT_shader_texture_lod : enable
	#extension GL_OES_standard_derivatives : enable
	` : ``;
	this.shader = gl.shaders["ssao"] = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, extra + FXSSAO.fs_code );
	return this.shader;
};

FXSSAO.prototype.applyFX = function( color_texture, normal_texture, depth_texture, camera, output_texture )
{
	if(!depth_texture)
		throw("depth texture missing");

	if(!output_texture)
		output_texture = new GL.Texture( depth_texture.width, depth_texture.height, { format: gl.RGB } );

	if(!color_texture)
		color_texture = GL.Texture.getWhiteTexture();

	var shader = this.getShader();
	if(!shader)
	{
		color_texture.copyTo(output_texture);
		return output_texture;
	}

	var uniforms = this.uniforms;

	uniforms.u_radius = this.properties.radius;
	uniforms.u_bias = this.properties.bias;
	uniforms.u_max_dist = this.properties.max_dist;
	uniforms.u_min_dist = this.properties.min_dist;
	uniforms.u_ao_power = this.properties.power;

	uniforms[ "u_color_texture" ] = color_texture.bind(0);
	uniforms[ "u_normal_texture" ] = normal_texture.bind(1);
	uniforms[ "u_depth_texture" ] = depth_texture.bind(2);
	uniforms[ "u_noise_texture" ] = FXSSAO.noise_texture.bind(3);

	var invvp = uniforms["u_invvp"];
	mat4.invert( invvp, camera.viewprojection_matrix )

	uniforms["u_projection"] = camera.projection_matrix;
	uniforms["u_view"] = camera.view_matrix;
	uniforms["u_near"] = camera.near;
	uniforms["u_far"] = camera.far;
	uniforms["u_linear_depth"] = camera.type == RD.Camera.PERSPECTIVE ? 0 : 1;
	uniforms["u_iresolution"][0] = 1.0 / output_texture.width;
	uniforms["u_iresolution"][1] = 1.0 / output_texture.height;
	uniforms["u_noise_scale"][0] = output_texture.width / 4;
	uniforms["u_noise_scale"][1] = output_texture.height / 4;
	// Render result texture
	output_texture.drawTo(function(){
		gl.disable( gl.DEPTH_TEST );
		gl.disable( gl.BLEND );
		shader.uniforms( uniforms ).draw( GL.Mesh.getScreenQuad() );
	});

	// Apply additional fx to resulting texture
	if( this.properties.blur )
		output_texture.applyBlur( 0.5, 0.5 , 1 );

	return output_texture;
}

FXSSAO.lerp = function(a,b,f) { return a + (b-a) * f; }

FXSSAO.generateSampleKernel = function( kernelSize )
{
	var kernel = [];

	for (var i = 0; i < kernelSize; i++)
	{
		var sample = vec3.create();
		sample[0] = (Math.random() * 2) - 1;    // -1 to 1
		sample[1] = (Math.random() * 2) - 1;    // -1 to 1
		sample[2] = (Math.random() * 2) - 1;    // -1 to 1
		//sample[2] = Math.random();              // 0 to 1  -> hemisphere
		
		sample = vec3.normalize(sample, sample);
		sample = vec3.scale(sample, sample, Math.random());

		// give more weights to closer samples 
		var scale = i / kernelSize;
		scale = FXSSAO.lerp(0.1, 1.0, scale * scale);
		sample = vec3.scale(sample, sample, scale);

		kernel.push( sample );
	}

	return GL.linearizeArray(kernel);
}

FXSSAO.generateNoiseTexture = function( noise_size )
{
	var size = noise_size * noise_size;
	
	var data = new Float32Array(size * 3);
	for (var i = 0; i < size; i+=3)
	{
		data[i] = (Math.random());             // -1 to 1 -> transform in shader
		data[i+1] = (Math.random());             // -1 to 1 -> transform in shader
		data[i+2] = 0;                          // 0 rotate around Z
	}

	var options = {
		type: GL.FLOAT,
		format: GL.RGB,
		pixel_data: data,
		filter: gl.NEAREST,
		wrap: gl.REPEAT,
		anisotropic: 1
	}

	return new GL.Texture(noise_size, noise_size, options);
}

FXSSAO.fs_code = `

precision highp float;
uniform mat4 u_projection;
uniform vec2 u_iresolution;
uniform mat4 u_invvp;
uniform mat4 u_view;
uniform float u_near;
uniform float u_far;

uniform sampler2D u_color_texture;
uniform sampler2D u_normal_texture;
uniform sampler2D u_depth_texture;
uniform sampler2D u_noise_texture;

uniform vec3 u_samples[64];
uniform float u_radius;
uniform float u_bias;
uniform float u_max_dist;
uniform float u_min_dist;
uniform float u_ao_power;
uniform vec2 u_noise_scale;

uniform int u_linear_depth;

varying vec2 v_coord;

float readDepth(sampler2D depthMap, vec2 coord) {
	float z_b = texture2D(depthMap, coord).r;
	float z_n = 2.0 * z_b - 1.0;
	if(u_linear_depth == 1)
		return z_b;
	float z_e = 2.0 * u_near * u_far / (u_far + u_near - z_n * (u_far - u_near));
	return z_e;
}

vec2 viewSpaceToScreenSpaceTexCoord(vec3 p) {
	vec4 projectedPos = u_projection * vec4(p, 1.0);
	vec2 ndcPos = projectedPos.xy / projectedPos.w; //normalized device coordinates
	vec2 coord = ndcPos * 0.5 + 0.5;
	return coord;
}

vec3 getPositionFromDepth(float depth, vec2 uvs) {

	depth = depth * 2.0 - 1.0;
	vec2 pos2D = uvs * 2.0 - vec2(1.0);
	vec4 pos = vec4( pos2D, depth, 1.0 );
	pos = u_invvp * pos;
	pos.xyz = pos.xyz / pos.w;
	return pos.xyz;
}

void main() {
	
	vec2 coord = gl_FragCoord.xy * u_iresolution;

	// Texture Maps
	vec4 colorMap = texture2D( u_color_texture, coord );
	vec4 normalMap = texture2D( u_normal_texture, coord);
	vec3 normal    = normalize(normalMap.xyz * 2. - vec3(1.));
	
	// Properties and depth
	float depth = texture2D( u_depth_texture, coord ).x;

	// Vectors
	normal = (u_view * vec4(normal, 0.0) ).xyz;
	vec3 position = getPositionFromDepth(depth, coord);
	position =  (u_view * vec4(position, 1.0) ).xyz;
	
	/*
	*	SSAO
	*/

	vec3 randomVec = texture2D(u_noise_texture, coord * u_noise_scale).xyz * 2.0 - vec3(1.0);

	float radius = u_radius;
	float bias = u_bias;
	float occlusion = 0.0;

	if(depth == 1.0) 
	{
		occlusion = 1.0;
	}
	else
	{
		for(int i = 0; i < 64; ++i)
		{
			// get sample position
			vec3 sample = u_samples[i]; // From tangent to view-space
			if( dot( sample, normal) < 0.0 )
				sample *= -1.0;
			sample = position + sample * radius;
			
			// transform to screen space 
			vec2 offset = viewSpaceToScreenSpaceTexCoord(sample);
			float sampleDepth = readDepth(u_depth_texture, offset);

			if( abs( (-sample.z) - sampleDepth ) > u_max_dist )
			continue;

			if( abs( (-sample.z) - sampleDepth ) < u_min_dist )
			continue;

			float rangeCheck =  smoothstep(0.0, 1.0, radius / abs((-sample.z) - sampleDepth));
			occlusion += (sampleDepth <= -sample.z ? 1.0 : 0.0) * rangeCheck;
		} 

		occlusion *= u_ao_power;
		occlusion = 1.0 - (occlusion / 64.0);
	}

	gl_FragColor = vec4(vec3(occlusion), 1.0);
}
`

// EDGES **********************************

class FXEdges {
	constructor()
	{
		this.properties = {
			enable: false,
			intensity: 1
		};
	
		this.uniforms = {
			u_linear_depth: 0,
			u_iresolution: vec2.create(),
			u_invvp: mat4.create()
		};		
	}
}

FXEdges.prototype.getShader = function()
{
    if (this.shader)
        return this.shader;
	var extra = gl.webgl_version == 1 ? `#extension GL_EXT_shader_texture_lod : enable
	#extension GL_OES_standard_derivatives : enable
	` : ``;
	this.shader = gl.shaders["edges"] = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, extra + FXEdges.fs_code );
	return this.shader;
};

FXEdges.prototype.applyFX = function( color_texture, normal_texture, depth_texture, camera, output_texture )
{
	if(!depth_texture)
		throw("depth texture missing");

	if(!output_texture || output_texture.width != depth_texture.width || output_texture.height != depth_texture.height )
		output_texture = new GL.Texture( depth_texture.width, depth_texture.height, { format: gl.RGB } );

	if(!color_texture)
		color_texture = GL.Texture.getWhiteTexture();

    var shader = this.getShader();
	if(!shader)
	{
		color_texture.copyTo(output_texture);
		return output_texture;
	}

	var uniforms = this.uniforms;

    uniforms[ "u_normal_texture" ] = normal_texture.bind(1);
    uniforms[ "u_depth_texture" ] = depth_texture.bind(2);

	var invvp = uniforms["u_invvp"];
    mat4.invert( invvp, camera.viewprojection_matrix );

	uniforms["u_intensity"] = this.properties.intensity;
    uniforms["u_near"] = camera.near;
    uniforms["u_far"] = camera.far;
	uniforms["u_linear_depth"] = camera.type == RD.Camera.PERSPECTIVE ? 0 : 1;
    uniforms["u_iresolution"][0] = 1.0 / output_texture.width;
	uniforms["u_iresolution"][1] = 1.0 / output_texture.height;
    // Render result texture
    output_texture.drawTo(function(){
        gl.disable( gl.DEPTH_TEST );
        gl.disable( gl.BLEND );
        shader.uniforms( uniforms ).draw( GL.Mesh.getScreenQuad() );
    });

	return output_texture;
}


FXEdges.fs_code = `
//#extension GL_EXT_shader_texture_lod : enable
//#extension GL_OES_standard_derivatives : enable

precision highp float;
uniform mat4 u_invvp;
uniform vec2 u_iresolution;
uniform float u_near;
uniform float u_far;
uniform float u_intensity;

uniform sampler2D u_normal_texture;
uniform sampler2D u_depth_texture;

uniform float u_linear_depth;

varying vec2 v_coord;

float getDistanceFromDepth(vec2 uvs)
{
	float d = texture2D( u_depth_texture, uvs ).x;
	if( u_linear_depth == 1.0 )
		return d * (u_far - u_near) + u_near;
	float z_n = 2.0 * d - 1.0;
	return 2.0 * u_near * u_far / (u_far + u_near - z_n * (u_far - u_near));
}

float getEdge( float d, vec2 uvs, vec2 v)
{
	float A = getDistanceFromDepth( uvs + v );
	float B = getDistanceFromDepth( uvs - v );
	return abs((d - A) - (B - d));
}

vec3 getNormal(vec2 uvs)
{
	vec4 normalMap = texture2D( u_normal_texture, uvs);
	return normalize(normalMap.xyz * 2. - vec3(1.));
}

float getNormalEdge( vec3 N, vec2 uvs, vec2 v)
{
	vec3 A = getNormal( uvs + v );
	vec3 B = getNormal( uvs - v );
	//return abs( (dot(N,A)*0.5+0.5) - (dot(B,N)*0.5+0.5) );
	return 1.0 - (dot(B,A)*0.5+0.5);
}

void main() {
	
	vec2 coord = gl_FragCoord.xy * u_iresolution;

	// Properties and depth
	float dist = getDistanceFromDepth( coord );
	vec3 N = getNormal( coord );

	//neightbours
	vec2 up = u_iresolution * vec2(0.0,1.0);
	vec2 right = u_iresolution * vec2(1.0,0.0);

	float edge = 0.0;
	edge += getEdge( dist, coord, up );
	edge += getEdge( dist, coord, right );
	edge += getEdge( dist, coord, up + right );
	edge += getEdge( dist, coord, right - up );

	float normal = 0.0;
	normal += getNormalEdge( N, coord, up );
	normal += getNormalEdge( N, coord, right );
	normal += getNormalEdge( N, coord, up + right );
	normal += getNormalEdge( N, coord, right - up );

	edge = max(edge,normal);
	edge = 1.0 - smoothstep(0.1,0.2,edge) * u_intensity;

	gl_FragColor = vec4(vec3(edge), 1.0);
}
`