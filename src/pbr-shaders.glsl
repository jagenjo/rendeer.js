\shaders

degamma_material default.vs degamma_material.fs
degamma @SCREEN degamma.fs
pbr default.vs pbr.fs
nopbr default.vs nopbr.fs
albedo default.vs albedo.fs
occlusion default.vs occlusion.fs
overlay default.vs overlay.fs
normals default.vs normals.fs
brdf_integrator @SCREEN brdf_integrator.fs
skybox default.vs skybox.fs
fxaa_tonemapper @SCREEN fxaa_tonemapper.fs
tonemapper @SCREEN tonemapper.fs

\skinning

attribute vec4 a_bone_indices;
attribute vec4 a_weights;
uniform mat4 u_bones[64];

void computeSkinning(inout vec4 vertex, inout vec4 normal)
{
	vertex = u_bones[int(a_bone_indices.x)] * a_weights.x * vertex + 
			u_bones[int(a_bone_indices.y)] * a_weights.y * vertex + 
			u_bones[int(a_bone_indices.z)] * a_weights.z * vertex + 
			u_bones[int(a_bone_indices.w)] * a_weights.w * vertex;
	normal =	u_bones[int(a_bone_indices.x)] * a_weights.x * normal + 
			u_bones[int(a_bone_indices.y)] * a_weights.y * normal + 
			u_bones[int(a_bone_indices.z)] * a_weights.z * normal + 
			u_bones[int(a_bone_indices.w)] * a_weights.w * normal;
	normal = normalize(normal);
}


\default.vs

	precision highp float;
	precision highp int;

	attribute vec3 a_vertex;
	attribute vec3 a_normal;
	attribute vec2 a_coord;
	#ifdef UVS2
		attribute vec2 a_coord1;
	#endif
	#ifdef COLOR
		attribute vec4 a_color;
	#endif

	varying vec3 v_wPosition;
	varying vec3 v_wNormal;
	varying vec2 v_coord;
	varying vec2 v_coord1;
	varying vec2 v_coord2;
	varying vec4 v_color;

	#ifdef INSTANCING
		attribute mat4 u_model;
	#else
		uniform mat4 u_model;
	#endif
	uniform mat4 u_viewprojection;
	uniform mat4 u_view;
	uniform mat3 u_texture_matrix;
	uniform vec4 u_viewport;

	#define DISPLACEMENTMAP 6
	uniform sampler2D u_displacement_texture;
	uniform int u_maps_info[10];
	uniform float u_displacement_factor;

	vec2 getUV( int index )
	{
		if(index == 0)
			return v_coord;
		if(index == 1)
			return v_coord1;
		if(index == 2)
			return v_coord2;
		return v_coord;
	}

	#ifdef POINTS
		uniform float u_camera_perspective;
		uniform float u_pointSize;
		float computePointSize( float radius, float w )
		{
			if(radius < 0.0)
				return -radius;
			return max(1.0, u_viewport.w * u_camera_perspective * radius / w);
		}
	#endif

	#ifdef SKINNING
		#import "skinning"
	#endif

	void main() {

		vec4 vertex4 = vec4(a_vertex,1.0);
		vec4 normal4 = vec4(a_normal,0.0);

		#ifdef SKINNING
			computeSkinning(vertex4,normal4);
		#endif

		v_wNormal = a_normal;
		v_coord = a_coord;
		v_coord1 = a_coord;
		v_coord2 = vec2( u_texture_matrix * vec3(a_coord,1.0) ).xy;

		#ifdef UVS2
			v_coord1 = a_coord1;
		#endif
		#ifdef COLOR
			v_color = a_color;
		#endif

		if( u_maps_info[DISPLACEMENTMAP] != -1 && u_displacement_factor != 0.0 ){
			float displace = texture2D(u_displacement_texture, getUV( u_maps_info[DISPLACEMENTMAP] ) ).x;
			vertex4.xyz += normal4.xyz * displace * u_displacement_factor;
		}

		//vertex
		vec4 worldpos = (u_model * vertex4);
		v_wPosition = worldpos.xyz;

		//normal
		v_wNormal = (u_model * normal4).xyz;
		gl_Position = u_viewprojection * worldpos;

		//barrel distortion
		//float sign = gl_Position.x < 0.0 ? -1.0 : 1.0;
		//gl_Position.x -= gl_Position.x * gl_Position.x * 0.1;

		//for point clouds
		#ifdef POINTS
			gl_PointSize = computePointSize( u_pointSize, gl_Position.w );
		#endif
	}

\pbr_brdf.inc

	#define GAMMA 2.2
	#define PI 3.14159265359
	#define RECIPROCAL_PI 0.3183098861837697
	#define MAX_REFLECTANCE 0.16
	#define MIN_REFLECTANCE 0.04
	#define MIN_PERCEPTUAL_ROUGHNESS 0.045
	#define MIN_ROUGHNESS            0.002025
	#define MIN_METALNESS            0.001
	#define MAX_CLEAR_COAT_PERCEPTUAL_ROUGHNESS 0.6

	#define MEDIUMP_FLT_MAX    65504.0
	#define saturateMediump(x) min(x, MEDIUMP_FLT_MAX)

	struct Light
	{
		float fallOf;
		vec3 direction;
	};	

	struct PBRMat
	{
		float linearRoughness;
		float roughness;
		float metallic;
		float alpha;
		float f90;
		vec3 f0;
		vec3 reflectance;
		vec3 baseColor;
		vec3 diffuseColor;
		vec3 specularColor;
		float clearCoat;
		float clearCoatRoughness;
		float clearCoatLinearRoughness;
		float anisotropy;
		vec3 anisotropicT;
		vec3 anisotropicB;

		vec3 N;
		vec3 V;
		vec3 H;
		vec3 R;
		float NoV;
		float NoL;
		float NoH;
		float LoH;
		float VoH;
		mat3 tangentToWorld;

		Light light;
	};

	float D_GGX_2(float linearRoughness, float NoH, const vec3 n, const vec3 h) {
	    vec3 NxH = cross(n, h);
	    float a = NoH * linearRoughness;
	    float k = linearRoughness / (dot(NxH, NxH) + a * a);
	    float d = k * k * (1.0 / PI);
	    return saturateMediump(d);
	}

	// Normal Distribution Function (NDC) using GGX Distribution
	float D_GGX (const in float NoH, const in float linearRoughness ) {
		
		float a2 = linearRoughness * linearRoughness;
		float f = (NoH * NoH) * (a2 - 1.0) + 1.0;
		return a2 / (PI * f * f);
		
	}

	// Geometry Term : Geometry masking / shadowing due to microfacets
	float GGX(float NdotV, float k){
		return NdotV / (NdotV * (1.0 - k) + k);
	}
	
	float G_Smith(float NdotV, float NdotL, float roughness){
		
		float k = pow(roughness + 1.0, 2.0) / 8.0;
		return GGX(NdotL, k) * GGX(NdotV, k);
	}

	// Geometric shadowing using Smith Geometric Shadowing function
	// Extracting visibility function V(v, l, a)
	float V_SmithGGXCorrelated(float NoV, float NoL, float linearRoughness) {
	    float a2 = linearRoughness * linearRoughness;
	    float GGXV = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
	    float GGXL = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
	    return 0.5 / (GGXV + GGXL);
	}

	// Approximation (Not correct 100% but has better performance)
	float V_SmithGGXCorrelatedFast(float NoV, float NoL, float linearRoughness) {
	    float a = linearRoughness;
	    float GGXV = NoL * (NoV * (1.0 - a) + a);
	    float GGXL = NoV * (NoL * (1.0 - a) + a);
	    return 0.5 / (GGXV + GGXL);
	}

	float Geometric_Smith_Schlick_GGX_(float a, float NdV, float NdL) {
	    // Smith schlick-GGX.
	    float k = a * 0.5;
	    float GV = NdV / (NdV * (1.0 - k) + k);
	    float GL = NdL / (NdL * (1.0 - k) + k);
	    return GV * GL;
	}

	// Visibility term (Kelemen) for Clear coat
	float V_Kelemen (const in float LoH ) {
		return 0.25 / (LoH * LoH);
	}

	// Fresnel effect: Specular F using Schlick approximation
	// f0 is the specular reflectance at normal incident angle
	float F_Schlick (const in float VoH, const in float f0, const in float f90) {
		return f0 + (f90 - f0) * pow(1.0 - VoH, 5.0);
	}

	// Fresnel term with scalar optimization(f90=1)
	vec3 F_Schlick (const in float VoH, const in vec3 f0) {
		float f = pow(1.0 - VoH, 5.0);
		return f0 + (vec3(1.0) - f0) * f;
	}

	float F_Schlick (const in float VoH, const in float f0) {
		return f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);
	}

	// Diffuse Reflections: Lambertian BRDF
	float Fd_Lambert() {
		return RECIPROCAL_PI;
	}

	// Diffuse Reflections: Disney BRDF using retro-reflections using F term
	float Fd_Burley (const in float NoV, const in float NoL, const in float LoH, const in float linearRoughness) {
		float f90 = 0.5 + 2.0 * linearRoughness * LoH * LoH;
		float lightScatter = F_Schlick(NoL, 1.0, f90);
		float viewScatter  = F_Schlick(NoV, 1.0, f90);
		return lightScatter * viewScatter * RECIPROCAL_PI;
	}

	float sq(float x) {
	    return x * x;
	}

	float max3(const vec3 v) {
	    return max(v.x, max(v.y, v.z));
	}

	float iorToF0 (float transmittedIor, float incidentIor) {
	    return sq((transmittedIor - incidentIor) / (transmittedIor + incidentIor));
	}

	float f0ToIor(float f0) {
	    float r = sqrt(f0);
	    return (1.0 + r) / (1.0 - r);
	}

	vec3 computeDielectricF0(vec3 reflectance) {
	    return MAX_REFLECTANCE * reflectance * reflectance;
	}

	vec3 f0ClearCoatToSurface(const vec3 f0, float ior) {

		return vec3( clamp(iorToF0(  f0ToIor(f0.x), ior ), 0.0, 1.0),
					clamp(iorToF0(  f0ToIor(f0.y), ior ), 0.0, 1.0),
					clamp(iorToF0(  f0ToIor(f0.z), ior ), 0.0, 1.0) );
	}

	vec3 computeDiffuseColor(vec3 baseColor, float metallic) {
	
		return (1.0 - metallic) * baseColor;
	}

	vec3 computeF0( const vec3 baseColor, float metallic, vec3 reflectance ) {
	    return baseColor * metallic + (reflectance * (1.0 - metallic));
	}

	float rand(vec2 co)  {
		return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
	}

	float specularClearCoat( const PBRMat material, inout float Fc) {

		float D = D_GGX( material.clearCoatLinearRoughness, material.NoH );
		float V = V_Kelemen( material.LoH );
		Fc = F_Schlick( material.LoH, 0.04, 1.0 ) * material.clearCoat; // 0.04 is the f0 for IOR = 1.5

		return (D * V) * Fc;
	}

	vec3 specularBRDF( const in PBRMat material ) {

		// Normal Distribution Function
		float D = D_GGX( material.NoH, material.linearRoughness );

		// Visibility Function (shadowing/masking)
		float V = G_Smith( material.NoV, material.NoL, material.roughness );
		
		// Fresnel
		vec3 F = F_Schlick( material.LoH, material.f0 );

		vec3 spec = (D * V) * F;
		spec /= (4.0 * material.NoL * material.NoV + 1e-6);

		return spec;
	}

\matrixOp.inc

	vec3 world2view( vec3 a ){ return  (u_view * vec4(a,1.0)).xyz; }
	vec3 view2world( vec3 a ){ return (u_invv * vec4(a,1.0)).xyz; }
	vec3 view2screen( vec3 a){ return  (u_projection * vec4(a,1.0)).xyz; }
	vec3 screen2view( vec3 a){ return (u_invp * vec4(a,1.0)).xyz; }

\sh.inc

	const float Pi = 3.141592654;
	const float CosineA0 = Pi;
	const float CosineA1 = (2.0 * Pi) / 3.0;
	const float CosineA2 = Pi * 0.25;

	struct SH9
	{
		float c[9];
	};

	struct SH9Color
	{
		vec3 c[9];
	};

	void SHCosineLobe(in vec3 dir, out SH9 sh)
	{
		// Band 0
		sh.c[0] = 0.282095 * CosineA0;
		
		// Band 1
		sh.c[1] = 0.488603 * dir.y * CosineA1;
		sh.c[2] = 0.488603 * dir.z * CosineA1;
		sh.c[3] = 0.488603 * dir.x * CosineA1;
		
		// Band 2
		#ifndef SH_LOW
		
		sh.c[4] = 1.092548 * dir.x * dir.y * CosineA2;
		sh.c[5] = 1.092548 * dir.y * dir.z * CosineA2;
		sh.c[6] = 0.315392 * (3.0 * dir.z * dir.z - 1.0) * CosineA2;
		sh.c[7] = 1.092548 * dir.x * dir.z * CosineA2;
		sh.c[8] = 0.546274 * (dir.x * dir.x - dir.y * dir.y) * CosineA2;
		#endif
		
	}

	vec3 ComputeSHDiffuse(in vec3 normal, in SH9Color radiance)
	{
		// Compute the cosine lobe in SH, oriented about the normal direction
		SH9 shCosine;
		SHCosineLobe(normal, shCosine);

		// Compute the SH dot product to get irradiance
		vec3 irradiance = vec3(0.0);
		#ifndef SH_LOW
		const int num = 9;
		#else
		const int num = 4;
		#endif
		
		for(int i = 0; i < num; ++i)
			irradiance += radiance.c[i] * shCosine.c[i];
		
		vec3 shDiffuse = irradiance * (1.0 / Pi);

		return irradiance;
	}


\header.inc

	#ifndef WEBGL2
		#extension GL_OES_standard_derivatives : enable
		#extension GL_EXT_shader_texture_lod : enable
	#endif
	precision highp float;
	precision highp int;

	varying vec3 v_wPosition;
	varying vec3 v_wNormal;
	varying vec2 v_coord;
	#ifdef UVS2
		varying vec2 v_coord1;
	#else
		vec2 v_coord1;
	#endif
	varying vec2 v_coord2;

	#ifdef COLOR
		varying vec4 v_color;
	#else
		vec4 v_color;
	#endif

	uniform mat4 u_invp;
	uniform mat4 u_invv;
	uniform mat4 u_invvp;
	uniform mat4 u_projection;
	uniform mat4 u_view;

	uniform float u_skybox_mipCount;
	uniform vec2 u_skybox_info; //[ rotation in rad, exposure ]
	uniform vec3 u_camera_position;
	uniform vec3 u_background_color;
	uniform vec4 u_clipping_plane;
	uniform vec4 u_viewport;
	uniform float u_exposure;
	uniform float u_gamma;
	uniform float u_occlusion_factor; //used to boost illumination

	uniform sampler2D u_brdf_texture;
	uniform bool u_useDiffuseSH;

	// Mat properties *********

	uniform vec3 u_albedo;
	uniform vec4 u_emissive;
	uniform float u_roughness;
	uniform float u_metalness;
	uniform float u_alpha;
	uniform float u_alpha_cutoff;
	uniform float u_normalFactor;
	uniform bool u_metallicRough;
	uniform float u_reflectance;
	uniform vec3 u_backface_color;

	uniform float u_clearCoat;
	uniform float u_clearCoatRoughness;
	uniform vec3 u_tintColor;
	
	uniform bool u_isAnisotropic;
	uniform float u_anisotropy;
	uniform vec3 u_anisotropy_direction;

	// Mat textures ****

	//material maps
	#define ALBEDOMAP 0
	#define METALLICROUGHNESSMAP 1
	#define OCCLUSIONMAP 2
	#define NORMALMAP 3
	#define EMISSIVEMAP 4
	#define OPACITYMAP 5
	#define DISPLACEMENTMAP 6
	#define DETAILMAP 7

	//maps info (tells if a texture is available and which uv set to use)
	uniform int u_maps_info[10];

	uniform sampler2D u_albedo_texture;
	uniform sampler2D u_metallicRoughness_texture;
	uniform sampler2D u_occlusion_texture;
	uniform sampler2D u_opacity_texture;
	uniform sampler2D u_normal_texture;
	uniform sampler2D u_emissive_texture;
	uniform sampler2D u_detail_texture;

	#import "sh.inc"
	#import "perturbNormal.inc"
	#import "pbr_brdf.inc"
	#import "matrixOp.inc"
	#import "testClippingPlane.inc"

	// Environment textures
	uniform bool u_use_environment_texture;
	uniform samplerCube u_SpecularEnvSampler_texture;
	uniform vec3 u_sh_coeffs[9];
	SH9Color coeffs;

	#ifdef PARALLAX_REFLECTION
	uniform mat4 u_cube_reflection_matrix;
	uniform mat4 u_inv_cube_reflection_matrix;
	#endif

	#ifdef PLANAR_REFLECTION
	uniform sampler2D u_planar_reflection_texture;
	uniform vec4 u_reflection_plane;
	#endif

	vec2 getUV( int index )
	{
		if(index == 0)
			return v_coord;
		if(index == 1)
			return v_coord1;
		if(index == 2)
			return v_coord2;
		if(index == 3)
			return gl_FragCoord.xy / u_viewport.zw;
		return v_coord;
	}

\dither4x4

float dither4x4(vec2 position, float brightness)
{
  int x = int(mod(position.x, 4.0));
  int y = int(mod(position.y, 4.0));
  int index = x + y * 4;
  float limit = 0.0;

  if (x < 8) {
    if (index == 0) limit = 0.0625;
    if (index == 1) limit = 0.5625;
    if (index == 2) limit = 0.1875;
    if (index == 3) limit = 0.6875;
    if (index == 4) limit = 0.8125;
    if (index == 5) limit = 0.3125;
    if (index == 6) limit = 0.9375;
    if (index == 7) limit = 0.4375;
    if (index == 8) limit = 0.25;
    if (index == 9) limit = 0.75;
    if (index == 10) limit = 0.125;
    if (index == 11) limit = 0.625;
    if (index == 12) limit = 1.0;
    if (index == 13) limit = 0.5;
    if (index == 14) limit = 0.875;
    if (index == 15) limit = 0.375;
  }

  return brightness < limit ? 0.0 : 1.0;
}


\pbr.fs

	//SHADER FOR PBR ***************************

	#import "header.inc"

	vec3 getReflectedVector( PBRMat material ) {
		
		float anisotropy = material.anisotropy;
		vec3 tangent = material.anisotropicT;
		vec3 bitangent = material.anisotropicB;

		vec3 anisotropicDirection = anisotropy >= 0.0 ? bitangent : tangent;
		vec3 anisotropicTangent = cross(anisotropicDirection, material.V);//vec3(1.0, 0.0, 0.0));
		vec3 anisotropicNormal = cross(anisotropicTangent, anisotropicDirection);
		vec3 bentNormal = normalize(mix(material.N, anisotropicNormal, anisotropy));
		return reflect(material.V, bentNormal);
	}

	void updateVectors (inout PBRMat material) {

		vec3 v = normalize(u_camera_position - v_wPosition);
		vec3 n = normalize( v_wNormal );
		if( gl_FrontFacing == false )
			n *= -1.0;

		if( u_maps_info[NORMALMAP] != -1 ){
			vec3 normal_map = texture2D(u_normal_texture, getUV( u_maps_info[NORMALMAP] ) ).xyz;
			vec3 n2 = perturbNormal( n, -v, v_coord, normal_map );
			n = normalize(mix(n, n2, u_normalFactor));
		}

		material.N = n;
		material.V = v;
		material.R = normalize(reflect(-v, n)); //reflected vector

		// Not using light vector L
		// in this render
		//vec3 l = normalize(u_light_position - v_wPosition);
		
		// anisotropy
	 	mat3 tangentToWorld;
		vec3 up = vec3(0.0, 1.0, 0.0);
		tangentToWorld[0] = normalize(cross(up, n));
		tangentToWorld[1] = cross(n, tangentToWorld[0]);
		tangentToWorld[2] = n;
		material.tangentToWorld = tangentToWorld;

		vec3 anisotropicT = normalize(tangentToWorld * vec3(u_anisotropy_direction));
		vec3 anisotropicB = normalize(cross(n, anisotropicT));

		material.anisotropicT = anisotropicT;
		material.anisotropicB = anisotropicB;

		// if material has anisotropy
		// or either has isotropy (more common)
		if(u_isAnisotropic)
			material.R = getReflectedVector(material);

		material.NoV = clamp(dot(n, v), 0.0, 0.99) + 1e-6;
	}

	void createMaterial (inout PBRMat material) {
		
		vec3 baseColor = u_albedo;

		if(u_maps_info[DETAILMAP] != -1){
			vec3 detail_tex = texture2D(u_detail_texture, getUV( u_maps_info[DETAILMAP] ) * 10.0 ).rgb;
			baseColor *= detail_tex;
		}

		if(u_maps_info[ALBEDOMAP] != -1){
			vec3 albedo_tex = texture2D(u_albedo_texture, getUV( u_maps_info[ALBEDOMAP] ) ).rgb;
			albedo_tex = pow(albedo_tex, vec3(u_gamma)); //degamma
			baseColor *= max(albedo_tex,vec3(0.01));
		}

		#ifdef COLOR
			baseColor *= v_color.xyz;
		#endif

		float metallic = u_metalness;
		float roughness = u_roughness;
		vec3 reflectance = vec3( u_reflectance );

		// GET METALLIC AND ROUGHNESS PARAMS
		if(u_maps_info[ METALLICROUGHNESSMAP ] != -1 )
		{
			vec4 sampler = texture2D(u_metallicRoughness_texture, getUV( u_maps_info[METALLICROUGHNESSMAP] ) );
			if(u_metallicRough) {
				roughness *= sampler.g; // roughness stored in g
				metallic *= sampler.b; // recompute metallness using metallic-rough texture
			}
			else
				roughness *= sampler.r;
		}

		metallic = max( metallic, MIN_METALNESS );
		roughness = clamp(roughness, MIN_ROUGHNESS, 1.0 );

		//metallic = 0.0; roughness = 1.0; reflectance = vec3(0.0);

		vec3 diffuseColor = computeDiffuseColor( baseColor, metallic ); // recompute diffuse color
		reflectance = computeDielectricF0( reflectance );
		vec3 f0 = computeF0( baseColor, metallic, reflectance );

		material.baseColor = baseColor;
		material.metallic = metallic;
		material.roughness = roughness;
		material.linearRoughness = roughness * roughness;
		material.f0 = f0;
		material.diffuseColor = diffuseColor; //baseColor * metallic
		material.reflectance = reflectance;
		material.anisotropy = u_anisotropy;

		/* CLEAR COAT
			// remap roughness: the base layer must be at least as rough as the clear coat layer
			roughness = clearCoat > 0.0 ? max( roughness, clearCoatRoughness ) : roughness;

			// GET COAT PARAMS
			float clearCoat = u_clearCoat; // clear coat strengh
			float clearCoatRoughness = u_clearCoatRoughness;
			clearCoatRoughness = mix(MIN_PERCEPTUAL_ROUGHNESS, MAX_CLEAR_COAT_PERCEPTUAL_ROUGHNESS, clearCoatRoughness);
			float clearCoatLinearRoughness = sq(clearCoatRoughness);

			// recompute f0 by computing its IOR
			f0 = mix(f0, f0ClearCoatToSurface(f0, 1.5), clearCoat);

			material.clearCoat = clearCoat;
			material.clearCoatRoughness = clearCoatRoughness;
			material.clearCoatLinearRoughness = clearCoatLinearRoughness;
		*/

		updateVectors( material );
	}

	vec3 rotate2D( vec3 v, float angle )
	{
		float s = sin(angle);                                                                                                                          
		float c = cos(angle);
		return vec3( v.x * c - v.z * s, v.y, v.x * s + v.z * c );
	}

	vec3 prem(vec3 R, float roughness, float rotation) {
		if(u_use_environment_texture == false)
			return u_background_color;

		float 	f = roughness * u_skybox_mipCount;
		vec3 	r = rotate2D(R, rotation);

		vec4 color = vec4(0.0);

		//float level = min(5.0,floor(f));
		//f = fract(f);
		//color = mix( textureCubeLodEXT(u_SpecularEnvSampler_texture, r, level), textureCubeLodEXT(u_SpecularEnvSampler_texture, r, level + 1.0), f );

		color = textureCubeLodEXT(u_SpecularEnvSampler_texture, r, f);
		
		//float offset = 3.0;
		//color = mix( textureCube(u_SpecularEnvSampler_texture, r, level + offset), textureCube(u_SpecularEnvSampler_texture, r, level + 1.0 + offset), f );

		return color.rgb;
	}

	vec3 reflectPoint( vec3 pos, vec3 orig, vec3 n )
	{
		vec3 v = orig - pos;
		float dist = dot(v,n);
		return pos - dist*n*2.0;
	}

	void getIBLContribution (PBRMat material, inout vec3 Fd, inout vec3 Fr)
	{
		float NdotV = material.NoV;

		vec2 brdfSamplePoint = vec2( NdotV, material.roughness );
		vec2 brdf = texture2D( u_brdf_texture, brdfSamplePoint ).rg;
		//brdf.y = 1.0 - brdf.y;
		brdf = pow(brdf, vec2(2.2));

		vec3 normal = material.N;

		vec3 diffuseSample = vec3(0.0);

		if(u_useDiffuseSH)
			diffuseSample = ComputeSHDiffuse( normal, coeffs );
		else
			diffuseSample = prem(normal, 1.0, u_skybox_info.x) * u_skybox_info.y; // diffuse part uses normal vector (no reflection)

		vec3 R = material.R;

		#ifdef PARALLAX_REFLECTION
			//https://seblagarde.wordpress.com/2012/09/29/image-based-lighting-approaches-and-parallax-corrected-cubemap/
			/*
			vec3 ReflCameraWS = reflectPoint(u_camera_position,v_wPosition,normal);

			//float3 RayWS = normalize(GetCubeDir(...)); // Current direction 
			//float3 RayLS = mul((float3x3)WorldToLocal, RayWS); 
			//float3 ReflCameraLS = mul(WorldToLocal, ReflCameraWS); // Can be precalc 

			vec3 RayLS = (u_inv_cube_reflection_matrix * vec4(v_wPosition,1.0)).xyz;
			vec3 ReflCameraLS = (u_inv_cube_reflection_matrix * vec4(ReflCameraWS,1.0)).xyz;

			vec3 Unitary = vec3(1.0f, 1.0f, 1.0f); 
			vec3 FirstPlaneIntersect = (Unitary - ReflCameraLS) / RayLS; 
			vec3 SecondPlaneIntersect = (-Unitary - ReflCameraLS) / RayLS; 
			vec3 FurthestPlane = max(FirstPlaneIntersect, SecondPlaneIntersect ); 
			float Distance = min(FurthestPlane.x, min(FurthestPlane.y, FurthestPlane.z)); 
			// Use Distance in WS directly to recover intersection 
			vec3 IntersectPositionWS = ReflCameraWS + RayWS * Distance; 
			vec3 ReflDirectionWS = IntersectPositionWS - CubemapPositionWS;
			*/
		#endif

		vec3 specularSample = prem( R, material.roughness, u_skybox_info.x ) * u_skybox_info.y;
		vec3 specularColor = mix( material.f0, material.baseColor.rgb, material.metallic );

		Fd += diffuseSample * material.diffuseColor;
		Fr += (specularSample * (specularColor * brdf.x + vec3(brdf.y)));
		//Fr *= material.metallic;

		//DEBUG
		//Fr = vec3(0.0); 
		//Fd = vec3( brdf, 0.0 ); 
		//Fd = vec3( material.roughness );
		//Fd = diffuseSample;
	}

	void applyIndirectLighting(inout PBRMat material, inout vec3 color)
	{
		// INDIRECT LIGHT: IBL ********************

		vec3 Fd_i = vec3(0.0);
		vec3 Fr_i = vec3(0.0);
		getIBLContribution( material, Fd_i, Fr_i );
		
		// CLEAT COAT LOBE ************************
		if(material.clearCoat > 0.0)
		{
			vec3 Fd_clearCoat = vec3(0.0);
			vec3 Fr_clearCoat = vec3(0.0);

			PBRMat clearCoat_material = material;
			clearCoat_material.roughness = material.clearCoatRoughness;

			float Fcc = F_Schlick(material.NoV, 0.04) * material.clearCoat;

			/*
			if(u_maps_info[DISPLACEMENTMAP] != -1){
				vec3 coat_bump = texture2D( u_displacement_texture, getUV(u_maps_info[DISPLACEMENTMAP]) ).xyz;
				coat_bump = normalize( perturbNormal( material.R, -material.V, v_coord, coat_bump ) );

				float coatNoV = clamp(dot(coat_bump, material.V), 0.0, 0.99) + 1e-6;
				Fcc = F_Schlick(coatNoV, 0.04) * material.clearCoat;

				// update reflection in clear coat mat
				clearCoat_material.R = reflect(- material.V, coat_bump);
			}
			*/

			getIBLContribution(clearCoat_material, Fd_clearCoat, Fr_clearCoat);

			// attenuate base layer for energy compensation
			Fd_i  *= (1.0 - Fcc); 

			// add specular coat layer
			Fr_i *= sq(1.0 - Fcc);
			Fr_i += Fr_clearCoat * Fcc;

			// apply tint
			Fr_i *= mix(vec3(1.0), u_tintColor, material.clearCoat );
		}

		vec3 indirect = Fd_i + Fr_i;
		
		// Apply baked ambient oclusion 
		if(u_maps_info[OCCLUSIONMAP] != -1)
		{
			vec3 occ = texture2D( u_occlusion_texture, getUV(u_maps_info[OCCLUSIONMAP]) ).xyz;
			if( u_metallicRough == true )
				occ.xyz = vec3(occ.x); //force to use only one channel
			occ *= u_occlusion_factor;
			indirect *= pow(occ, vec3(u_gamma)); //degamma
		}

		color = indirect;
	}

	void main() {

		#ifndef UVS2
			v_coord1 = v_coord;
		#endif
		#ifndef COLOR
			v_color = vec4(1.0);
		#endif

		if( testClippingPlane( u_clipping_plane, v_wPosition) < 0.0 )
			discard;
        
		vec3 color;
		float alpha = u_alpha;

		// fill sh color
		if(u_useDiffuseSH)
		{
			coeffs.c[0] = u_sh_coeffs[0];
			coeffs.c[1] = u_sh_coeffs[1];
			coeffs.c[2] = u_sh_coeffs[2];
			coeffs.c[3] = u_sh_coeffs[3];
			coeffs.c[4] = u_sh_coeffs[4];
			coeffs.c[5] = u_sh_coeffs[5];
			coeffs.c[6] = u_sh_coeffs[6];
			coeffs.c[7] = u_sh_coeffs[7];
			coeffs.c[8] = u_sh_coeffs[8];
		}

		PBRMat material;
		createMaterial( material );

		if(u_maps_info[OPACITYMAP] != -1)
			alpha *= texture2D( u_opacity_texture, getUV(u_maps_info[OPACITYMAP]) ).r;
		else if(u_maps_info[ALBEDOMAP] != -1)
			alpha *= texture2D( u_albedo_texture, getUV(u_maps_info[ALBEDOMAP]) ).a;
		#ifdef COLOR
			alpha *= v_color.a;
		#endif

		vec3 emissive = u_emissive.xyz;	
		if(u_maps_info[EMISSIVEMAP] != -1)
		{
			vec2 emissive_uv = getUV(u_maps_info[EMISSIVEMAP]);
			if( u_emissive.w == 0.0 || (emissive_uv.x > 0.0 && emissive_uv.x < 1.0 && emissive_uv.y > 0.0 && emissive_uv.y < 1.0) )
			{
				vec4 emissive_tex = texture2D(u_emissive_texture, emissive_uv );
				emissive_tex.xyz = pow(emissive_tex.xyz, vec3(u_gamma)); //degamma
				emissive *= emissive_tex.xyz;
				alpha *= emissive_tex.a;
			}
			else
				emissive = vec3(0.0);
		}

		if( alpha <= u_alpha_cutoff )
			discard;
		//if( dither4x4(gl_FragCoord.xy, alpha) == 0.0 )
		//	discard;

		applyIndirectLighting( material, color );

		color += emissive;

		if( gl_FrontFacing == false )
			color.xyz *= u_backface_color;

		//color.xyz = material.N;

		gl_FragColor = vec4( vec3(color) * u_exposure, alpha );
		//gl_FragColor.a = min(1.0,gl_FragColor.a + length( gl_FragColor.xyz ) * alpha * 0.2);
	}


\nopbr.fs

	//SHADER FOR NON-PBR ***************************

	#import "header.inc"

	uniform float u_tonemapper;
	//uniform float u_gamma;

	void main() {
       		#ifndef UVS2
			v_coord1 = v_coord;
		#endif
		#ifndef COLOR
			v_color = vec4(1.0);
		#endif

		if( testClippingPlane( u_clipping_plane, v_wPosition ) < 0.0 )
			discard;

		vec3 color = u_albedo * v_color.xyz;
		float alpha = u_alpha;

		if(u_maps_info[DETAILMAP] != -1){
			vec3 detail_tex = texture2D(u_detail_texture, getUV( u_maps_info[DETAILMAP] ) * 10.0 ).rgb;
			color *= detail_tex;
		}

		if(u_maps_info[ALBEDOMAP] != -1)
		{
			vec4 color4 = texture2D( u_albedo_texture, getUV(u_maps_info[ALBEDOMAP]) );
			color4.xyz = pow(color4.xyz, vec3(u_gamma)); //degamma
			color *= color4.xyz;
			alpha *= color4.a;
		}

		if(u_maps_info[ OCCLUSIONMAP ] != -1)
		{
			vec3 occ = texture2D( u_occlusion_texture, getUV(u_maps_info[OCCLUSIONMAP]) ).xyz;
			color *= pow(occ, vec3(u_gamma)); //degamma
		}

		if(u_maps_info[ OPACITYMAP ] != -1)
			alpha *= texture2D( u_opacity_texture, getUV(u_maps_info[OPACITYMAP]) ).r;

		vec3 emissive = u_emissive.xyz;	
		if(u_maps_info[ EMISSIVEMAP ] != -1)
		{
			vec2 emissive_uv = getUV(u_maps_info[EMISSIVEMAP]);
			if( u_emissive.w == 0.0 || (emissive_uv.x > 0.0 && emissive_uv.x < 1.0 && emissive_uv.y > 0.0 && emissive_uv.y < 1.0) )
			{
				vec4 emissive_tex = texture2D(u_emissive_texture, emissive_uv );
				emissive_tex.xyz = pow( emissive_tex.xyz, vec3(u_gamma) ); //degamma
				emissive *= emissive_tex.xyz;
				alpha *= emissive_tex.a;
			}
			else //outside of 0..1 range
				emissive = vec3(0.0);
		}

		if( alpha <= u_alpha_cutoff)
			discard;

		color += emissive;
		color *= u_exposure;
		if( gl_FrontFacing == false )
			color.xyz *= u_backface_color;

		color = max(color,vec3(0.0)); //to avoid artifacts
		if( u_tonemapper != 0.0 )
			color = pow(color, vec3(1.0 / u_gamma));

		gl_FragColor = vec4( color, alpha );
	}

\albedo.fs

	//SHADER FOR NON-PBR ***************************

	#import "header.inc"

	uniform float u_tonemapper;
	//uniform float u_gamma;

	void main() {
       		#ifndef UVS2
			v_coord1 = v_coord;
		#endif
		#ifndef COLOR
			v_color = vec4(1.0);
		#endif

		if( testClippingPlane( u_clipping_plane, v_wPosition ) < 0.0 )
			discard;

		vec3 color = u_albedo * v_color.xyz;
		float alpha = u_alpha;

		if(u_maps_info[DETAILMAP] != -1){
			vec3 detail_tex = texture2D(u_detail_texture, getUV( u_maps_info[DETAILMAP] ) * 10.0 ).rgb;
			color *= detail_tex;
		}

		if(u_maps_info[ALBEDOMAP] != -1)
		{
			vec4 color4 = texture2D( u_albedo_texture, getUV(u_maps_info[ALBEDOMAP]) );
			color4.xyz = pow(color4.xyz, vec3(u_gamma)); //degamma
			color *= color4.xyz;
			alpha *= color4.a;
		}

		if( alpha <= u_alpha_cutoff)
			discard;

		color *= u_exposure;
		if( gl_FrontFacing == false )
			color.xyz *= u_backface_color;

		color = max(color,vec3(0.0)); //to avoid artifacts
		if( u_tonemapper != 0.0 )
			color = pow(color, vec3(1.0 / u_gamma));

		gl_FragColor = vec4( color, alpha );
	}

\occlusion.fs

	//SHADER FOR NON-PBR ***************************

	#import "header.inc"

	uniform float u_tonemapper;
	//uniform float u_gamma;

	void main() {
       		#ifndef UVS2
			v_coord1 = v_coord;
		#endif
		#ifndef COLOR
			v_color = vec4(1.0);
		#endif

		if( testClippingPlane( u_clipping_plane, v_wPosition ) < 0.0 )
			discard;

		vec3 color = vec3(1.0); //u_albedo * v_color.xyz;
		float alpha = u_alpha;

		if(u_maps_info[ OCCLUSIONMAP ] != -1)
		{
			vec3 occ = texture2D( u_occlusion_texture, getUV(u_maps_info[OCCLUSIONMAP]) ).xyz;
			color *= pow(occ, vec3(u_gamma)); //degamma
		}

		color *= u_exposure;
		if( gl_FrontFacing == false )
			color.xyz *= u_backface_color;

		color = max(color,vec3(0.0)); //to avoid artifacts
		if( u_tonemapper != 0.0 )
			color = pow(color, vec3(1.0 / u_gamma));

		gl_FragColor = vec4( color, alpha );
	}


\overlay.fs

	//SHADER FOR SURFACES THAT SHOULD NOT BE COLOR CORRECTED ***************************

	#import "header.inc"

	void main() {
       		#ifndef UVS2
			v_coord1 = v_coord;
		#endif
		#ifndef COLOR
			v_color = vec4(1.0);
		#endif

		if( testClippingPlane( u_clipping_plane, v_wPosition ) < 0.0 )
			discard;

		vec3 color = u_albedo * v_color.xyz;
		float alpha = u_alpha;

		if(u_maps_info[DETAILMAP] != -1){
			vec3 detail_tex = texture2D(u_detail_texture, getUV( u_maps_info[DETAILMAP] ) * 10.0 ).rgb;
			color *= detail_tex;
		}

		if(u_maps_info[ALBEDOMAP] != -1)
		{
			vec4 color4 = texture2D( u_albedo_texture, getUV(u_maps_info[ALBEDOMAP]) );
			color *= color4.xyz;
			alpha *= color4.a;
		}

		if(u_maps_info[ OCCLUSIONMAP ] != -1)
		{
			vec3 occ = texture2D( u_occlusion_texture, getUV(u_maps_info[OCCLUSIONMAP]) ).xyz;
		}

		if(u_maps_info[ OPACITYMAP ] != -1)
			alpha *= texture2D( u_opacity_texture, getUV(u_maps_info[OPACITYMAP]) ).r;

		vec3 emissive = u_emissive.xyz;	
		if(u_maps_info[ EMISSIVEMAP ] != -1)
		{
			vec2 emissive_uv = getUV(u_maps_info[EMISSIVEMAP]);
			if( u_emissive.w == 0.0 || (emissive_uv.x > 0.0 && emissive_uv.x < 1.0 && emissive_uv.y > 0.0 && emissive_uv.y < 1.0) )
			{
				vec4 emissive_tex = texture2D(u_emissive_texture, emissive_uv );
				emissive *= emissive_tex.xyz;
				alpha *= emissive_tex.a;
			}
			else
				emissive = vec3(0.0);
		}

		if( alpha <= u_alpha_cutoff)
			discard;

		color += emissive;
		if( gl_FrontFacing == false )
			color.xyz *= 0.1;

		gl_FragColor = vec4( color, alpha );
	}


\degamma.fs

	precision highp float;

	varying vec2 v_coord;
	uniform sampler2D u_texture;
	uniform float u_gamma;
	uniform float u_exposure;
	uniform vec4 u_color;

	void main() {
		vec4 color4 = u_color * texture2D( u_texture, v_coord );
		color4.xyz = pow(color4.xyz, vec3(u_gamma)) * u_exposure; //degamma
		gl_FragColor = color4;
	}

\degamma_material.fs

	precision highp float;

	varying vec2 v_coord;
	uniform vec4 u_color;
	uniform sampler2D u_color_texture;
	uniform float u_exposure;
	uniform float u_gamma;

	void main() {
		vec4 color4 = u_color * texture2D( u_color_texture, v_coord );
		color4.xyz = pow(color4.xyz, vec3(u_gamma)) * u_exposure; //degamma
		gl_FragColor = color4;
	}


\normals.fs

	#ifndef WEBGL2
		#extension GL_OES_standard_derivatives : enable
		#extension GL_EXT_shader_texture_lod : enable
	#endif
	precision highp float;
	precision highp int;

	varying vec3 v_wPosition;
	varying vec3 v_wNormal;
	varying vec2 v_coord;
	#ifdef UVS2
		varying vec2 v_coord1;
	#else
		vec2 v_coord1;
	#endif
	varying vec2 v_coord2;

	uniform mat4 u_invp;
	uniform mat4 u_invv;
	uniform mat4 u_invvp;
	uniform mat4 u_projection;
	uniform mat4 u_view;

	uniform vec3 u_camera_position;
	uniform vec4 u_viewport;
	uniform vec4 u_clipping_plane;
	uniform float u_normalFactor;

	uniform float u_gamma;

	// Mat properties *********

	uniform float u_alpha;
	uniform float u_alpha_cutoff;

	// Mat textures ****

	//material maps
	#define ALBEDOMAP 0
	#define METALLICROUGHNESSMAP 1
	#define OCCLUSIONMAP 2
	#define NORMALMAP 3
	#define EMISSIVEMAP 4
	#define OPACITYMAP 5
	#define DISPLACEMENTMAP 6
	#define DETAILMAP 7

	//maps info (like uvs, if available, etc)
	uniform int u_maps_info[10];

	uniform sampler2D u_albedo_texture;
	uniform sampler2D u_opacity_texture;
	uniform sampler2D u_normal_texture;
	uniform sampler2D u_detail_texture;

	#import "perturbNormal.inc"

	uniform mat3 u_texture_matrix;
	vec2 getUV( int index )
	{
		if(index == 2)
			return v_coord2;
		if(index == 1)
			return v_coord1;
		return v_coord;
	}

	float testClippingPlane(vec4 plane, vec3 p)
	{
		if(plane.x == 0.0 && plane.y == 0.0 && plane.z == 0.0)
			return 0.0;
		return (dot(plane.xyz, p) - plane.w) / dot(plane.xyz,plane.xyz);
	}

	void main() {
       		#ifndef UVS2
			v_coord1 = v_coord;
		#endif

		if( testClippingPlane( u_clipping_plane, v_wPosition ) < 0.0 )
			discard;

		vec3 color = vec3(0.0);
		float alpha = u_alpha;

		if(u_maps_info[ALBEDOMAP] != -1)
		{
			vec4 color4 = texture2D( u_albedo_texture, getUV(u_maps_info[ALBEDOMAP]) );
			alpha *= color4.a;
		}

		if(u_maps_info[ OPACITYMAP ] != -1)
			alpha *= texture2D( u_opacity_texture, getUV(u_maps_info[OPACITYMAP]) ).r;

		if( alpha < u_alpha_cutoff)
			discard;

		vec3 v = normalize(u_camera_position - v_wPosition);
		vec3 n = normalize( v_wNormal );
		if( gl_FrontFacing == false )
			n *= -1.0;

		if( u_maps_info[NORMALMAP] != -1 ) {
			vec2 norm_uv = getUV(u_maps_info[NORMALMAP]);
			vec3 normal_map = texture2D(u_normal_texture, norm_uv ).xyz;
			vec3 n2 = perturbNormal( n, -v, norm_uv, normal_map );
			n = normalize(mix(n, n2, u_normalFactor));
		}

		color = abs(n);

		gl_FragColor = vec4( color, alpha );
	}


\brdf_integrator.fs

	// BLENDER METHOD
	precision highp float;
	varying vec2 v_coord;
	varying vec3 v_vertex;
	vec2 jitternoise = vec2(0.0);

	uniform sampler2D u_hammersley_sample_texture;

	#define sampleCount 8192
	#define PI 3.1415926535897932384626433832795
	
	const float HAMMERSLEY_SIZE = 8192.0;

	/* -- Tangent Space conversion -- */
	vec3 tangent_to_world(vec3 vector, vec3 N, vec3 T, vec3 B)
	{
	  return T * vector.x + B * vector.y + N * vector.z;
	}
	vec2 noise2v(vec2 co)  {
	    return vec2(
			fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453),
			fract(sin(dot(co.yx ,vec2(12.9898,78.233))) * 43758.5453)
		);
	}
	float noise(vec2 co)  {
	    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
	}
	vec3 sample_ggx(vec3 rand, float a2)
	{
	  /* Theta is the aperture angle of the cone */
	  float z = sqrt((1.0 - rand.x) / (1.0 + a2 * rand.x - rand.x)); /* cos theta */
	  float r = sqrt(max(0.0, 1.0 - z * z));                        /* sin theta */
	  float x = r * rand.y;
	  float y = r * rand.z;

	  /* Microfacet Normal */
	  return vec3(x, y, z);
	}
	vec3 hammersley_3d(float i, float invsamplenbr)
	{
	  vec3 Xi; /* Theta, cos(Phi), sin(Phi) */

	  Xi.x = i * invsamplenbr; /* i/samples */
	  Xi.x = fract(Xi.x + jitternoise.x);

	  int u = int(mod(i + jitternoise.y * HAMMERSLEY_SIZE, HAMMERSLEY_SIZE));

	  Xi.yz = texture2D(u_hammersley_sample_texture, vec2(u, 0)).rg;

	  return Xi;
	}
	vec2 Hammersley(const in int index, const in int numSamples){
		vec2 r = fract(vec2(float(index) * 5.3983, float(int(int(2147483647.0) - index)) * 5.4427));
		r += dot(r.yx, r.xy + vec2(21.5351, 14.3137));
		return fract(vec2(float(index) / float(numSamples), (r.x * r.y) * 95.4337));
	}
	vec3 sample_ggx(float nsample, float a2, vec3 N, vec3 T, vec3 B)
	{
		vec3 Xi = vec3(
			Hammersley(int(nsample), sampleCount),
			0.0
		);
		// Xi = hammersley_3d(nsample, float(1.0/float(sampleCount)));
		vec3 Ht = sample_ggx(Xi, a2);
		return tangent_to_world(Ht, N, T, B);
	}
	float G1_Smith_GGX(float NX, float a2)
	{
	  /* Using Brian Karis approach and refactoring by NX/NX
	   * this way the (2*NL)*(2*NV) in G = G1(V) * G1(L) gets canceled by the brdf denominator 4*NL*NV
	   * Rcp is done on the whole G later
	   * Note that this is not convenient for the transmission formula */
	  return NX + sqrt(NX * (NX - NX * a2) + a2);
	  /* return 2 / (1 + sqrt(1 + a2 * (1 - NX*NX) / (NX*NX) ) ); /* Reference function */
	}
	
	void main() {

		vec3 N, T, B, V;

		float NV = ((clamp(v_coord.y, 1e-4, 0.9999)));
		float sqrtRoughness = clamp(v_coord.x, 1e-4, 0.9999);
		float a = sqrtRoughness * sqrtRoughness;
		float a2 = a * a;

		N = vec3(0.0, 0.0, 1.0);
		T = vec3(1.0, 0.0, 0.0);
		B = vec3(0.0, 1.0, 0.0);
		V = vec3(sqrt(1.0 - NV * NV), 0.0, NV);

		// Setup noise (blender version)
		jitternoise = noise2v(v_coord);

		 /* Integrating BRDF */
		float brdf_accum = 0.0;
		float fresnel_accum = 0.0;
		for (int i = 0; i < sampleCount; i++) {
			vec3 H = sample_ggx(float(i), a2, N, T, B); /* Microfacet normal */
			vec3 L = -reflect(V, H);
			float NL = L.z;

			if (NL > 0.0) {
				float NH = max(H.z, 0.0);
				float VH = max(dot(V, H), 0.0);

				float G1_v = G1_Smith_GGX(NV, a2);
				float G1_l = G1_Smith_GGX(NL, a2);
				float G_smith = 4.0 * NV * NL / (G1_v * G1_l); /* See G1_Smith_GGX for explanations. */

				float brdf = (G_smith * VH) / (NH * NV);
				float Fc = pow(1.0 - VH, 5.0);

				brdf_accum += (1.0 - Fc) * brdf;
				fresnel_accum += Fc * brdf;
			}
		}

		brdf_accum /= float(sampleCount);
		fresnel_accum /= float(sampleCount);

		gl_FragColor = vec4(brdf_accum, fresnel_accum, 0.0, 1.0);
	}


\skybox.fs
// Shader used to show skybox 

	#ifndef WEBGL2
		#extension GL_EXT_shader_texture_lod : enable
	#endif

	precision highp float;
	varying vec3 v_wPosition;
	varying vec3 v_wNormal;
	varying vec2 v_coord;
	uniform float u_rotation;
	uniform vec3 u_camera_position;
	uniform float u_mipmap_offset;

	uniform samplerCube u_color_texture;
	uniform bool u_is_rgbe;
	uniform float u_exposure;

	mat4 rotationMatrix(vec3 a, float angle) {

		vec3 axis = normalize(a);
		float s = sin(angle);
		float c = cos(angle);
		float oc = 1.0 - c;
		
		return mat4(oc*axis.x*axis.x+c,oc*axis.x*axis.y-axis.z*s,oc*axis.z*axis.x+axis.y*s,0.0,
			oc*axis.x*axis.y+axis.z*s,oc*axis.y*axis.y+c,oc*axis.y*axis.z-axis.x*s,0.0,
			oc*axis.z*axis.x-axis.y*s,oc*axis.y*axis.z+axis.x*s,oc*axis.z*axis.z+c,0.0,
			0.0,0.0,0.0,1.0);
	}

	void main() {
		//E is camera to point
		vec3 E = normalize(v_wPosition - u_camera_position);
		E = (rotationMatrix(vec3(0.0,1.0,0.0),u_rotation) * vec4(E,1.0)).xyz;

		vec4 color = textureCubeLodEXT(u_color_texture, E, u_mipmap_offset );

		// color = pow(color, vec4(2.2));

		if(u_is_rgbe)
			color = vec4(color.rgb * pow(2.0, color.a * 255.0 - 128.0), 1.0);

		color.xyz *= u_exposure;
		gl_FragColor = color;
	}


\perturbNormal.inc

	mat3 cotangent_frame(vec3 N, vec3 p, vec2 uv, inout vec3 t, inout vec3 b){
		// get edge vectors of the pixel triangle
		vec3 dp1 = dFdx( p );
		vec3 dp2 = dFdy( p );
		vec2 duv1 = dFdx( uv );
		vec2 duv2 = dFdy( uv );

		// solve the linear system
		vec3 dp2perp = cross( dp2, N );
		vec3 dp1perp = cross( N, dp1 );
		vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
		vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;

		// construct a scale-invariant frame
		float invmax = inversesqrt( max( dot(T,T), dot(B,B) ) );

		t = T * invmax;
		b = B * invmax;

		return mat3( t, b, N );
	}

	mat3 cotangent_frame(vec3 N, vec3 p, vec2 uv){
		// get edge vectors of the pixel triangle
		vec3 dp1 = dFdx( p );
		vec3 dp2 = dFdy( p );
		vec2 duv1 = dFdx( uv );
		vec2 duv2 = dFdy( uv );

		// solve the linear system
		vec3 dp2perp = cross( dp2, N );
		vec3 dp1perp = cross( N, dp1 );
		vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
		vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;

		// construct a scale-invariant frame
		float invmax = inversesqrt( max( dot(T,T), dot(B,B) ) );
		return mat3( T * invmax, B * invmax, N );
	}

	vec3 perturbNormal( mat3 TBN, vec3 normal_pixel ){
	
		normal_pixel = normal_pixel * 255./127. - 128./127.;
		return normalize(TBN * normal_pixel);
	}

	vec3 perturbNormal( vec3 N, vec3 V, vec2 texcoord, vec3 normal_pixel ){
	
		// assume N, the interpolated vertex normal and
		// V, the view vector (vertex to eye)
		normal_pixel = normal_pixel * 255./127. - 128./127.;
		mat3 TBN = cotangent_frame(N, V, texcoord);
		return normalize(TBN * normal_pixel);
	}

\testClippingPlane.inc

float testClippingPlane(vec4 plane, vec3 p)
{
	if(plane.x == 0.0 && plane.y == 0.0 && plane.z == 0.0)
		return 0.0;
	return (dot(plane.xyz, p) - plane.w) / dot(plane.xyz,plane.xyz);
}


\fresnel.inc
	
	//  Spherical Gaussian approximation
	vec3 fresnelSchlick(vec3 F0, float LdotH)
	{
		float power = (-5.55473 * LdotH - 6.98316) * LdotH;
		return F0 + (vec3(1.0) - F0) * pow(2.0, power);
	}

	// Shlick's approximation of the Fresnel factor.
	vec3 fresnelGDC(vec3 F0, float val)
	{
		return F0 + (vec3(1.0) - F0) * pow( (1.0 - val) , 5.0);
	}

	// Optimized variant (presented by Epic at SIGGRAPH '13)
	// https://cdn2.unrealengine.com/Resources/files/2013SiggraphPresentationsNotes-26915738.pdf
	vec3 F_Schlick( const in vec3 specularColor, const in float dotLH ) {
	
		float fresnel = exp2( ( -5.55473 * dotLH - 6.98316 ) * dotLH );
		return ( 1.0 - specularColor ) * fresnel + specularColor;
	} 

\fxaa_tonemapper.fs

	precision highp float;
	varying vec3 v_wPosition;
	varying vec3 v_wNormal;
	varying vec2 v_coord;
	uniform vec4 u_color;
	uniform float u_brightness;
	uniform float u_contrast;
	uniform float u_gamma;

	uniform sampler2D u_color_texture;

	uniform vec2 u_viewportSize;
	uniform vec2 u_iViewportSize;
	#define FXAA_REDUCE_MIN   (1.0/ 128.0)
	#define FXAA_REDUCE_MUL   (1.0 / 8.0)
	#define FXAA_SPAN_MAX     8.0
	
	/* from mitsuhiko/webgl-meincraft based on the code on geeks3d.com */
	vec4 applyFXAA(sampler2D tex, vec2 fragCoord)
	{
		vec4 color = vec4(0.0);
		fragCoord *= u_viewportSize;
		
		//vec2 u_iViewportSize = vec2(1.0 / u_viewportSize.x, 1.0 / u_viewportSize.y);

		vec3 rgbNW = texture2D(tex, (fragCoord + vec2(-1.0, -1.0)) * u_iViewportSize).xyz;
		vec3 rgbNE = texture2D(tex, (fragCoord + vec2(1.0, -1.0)) * u_iViewportSize).xyz;
		vec3 rgbSW = texture2D(tex, (fragCoord + vec2(-1.0, 1.0)) * u_iViewportSize).xyz;
		vec3 rgbSE = texture2D(tex, (fragCoord + vec2(1.0, 1.0)) * u_iViewportSize).xyz;
		vec3 rgbM  = texture2D(tex, fragCoord  * u_iViewportSize).xyz;
		vec3 luma = vec3(0.299, 0.587, 0.114);
		float lumaNW = dot(rgbNW, luma);
		float lumaNE = dot(rgbNE, luma);
		float lumaSW = dot(rgbSW, luma);
		float lumaSE = dot(rgbSE, luma);
		float lumaM  = dot(rgbM,  luma);
		float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
		float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));

		vec2 dir;
		dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
		dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));

		float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
		
		float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
		dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX), max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX), dir * rcpDirMin)) * u_iViewportSize;
		
		vec3 rgbA = 0.5 * (texture2D(tex, fragCoord * u_iViewportSize + dir * (1.0 / 3.0 - 0.5)).xyz + 
			texture2D(tex, fragCoord * u_iViewportSize + dir * (2.0 / 3.0 - 0.5)).xyz);
		vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tex, fragCoord * u_iViewportSize + dir * -0.5).xyz + 
			texture2D(tex, fragCoord * u_iViewportSize + dir * 0.5).xyz);
		
		//return vec4(rgbA,1.0);
		
		float lumaB = dot(rgbB, luma);
		if ((lumaB < lumaMin) || (lumaB > lumaMax))
			color = vec4(rgbA, 1.0);
		else
			color = vec4(rgbB, 1.0);
		return color;
	}

	vec3 uncharted2Tonemap(const vec3 x) {
		const float A = 0.15;
		const float B = 0.50;
		const float C = 0.10;
		const float D = 0.20;
		const float E = 0.02;
		const float F = 0.30;
		return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
	}

	// http://filmicworlds.com/blog/filmic-tonemapping-operators/
	vec3 tonemapUncharted2(const vec3 color) {
		const float W = 11.2;
		const float exposureBias = 2.0;
		vec3 curr = uncharted2Tonemap(exposureBias * color);
		vec3 whiteScale = 1.0 / uncharted2Tonemap(vec3(W));
		return curr * whiteScale;
	}

	void main() {

		//vec4 color = texture2D(u_color_texture, v_coord);

		//FXAA
		vec4 color = applyFXAA(u_color_texture, v_coord);

		//Tonemapper
		color.rgb = tonemapUncharted2(color.rgb);

		//gamma
		color.rgb = pow(color.rgb, vec3(1./u_gamma));

		//contrast
		color.rgb = (color.rgb - vec3(0.5)) * u_contrast + vec3(0.5);

		//brightness
		color.rgb *= u_brightness;

		gl_FragColor = color;
	}


\tonemapper.fs

	precision highp float;
	varying vec3 v_wPosition;
	varying vec3 v_wNormal;
	varying vec2 v_coord;
	uniform vec4 u_color;
	uniform float u_brightness;
	uniform float u_contrast;
	uniform float u_gamma;

	uniform sampler2D u_color_texture;

	uniform vec2 u_viewportSize;
	uniform vec2 u_iViewportSize;

	vec3 uncharted2Tonemap(const vec3 x) {
		const float A = 0.15;
		const float B = 0.50;
		const float C = 0.10;
		const float D = 0.20;
		const float E = 0.02;
		const float F = 0.30;
		return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
	}

	// http://filmicworlds.com/blog/filmic-tonemapping-operators/
	vec3 tonemapUncharted2(const vec3 color) {
		const float W = 11.2;
		const float exposureBias = 2.0;
		vec3 curr = uncharted2Tonemap(exposureBias * color);
		vec3 whiteScale = 1.0 / uncharted2Tonemap(vec3(W));
		return curr * whiteScale;
	}

	void main() {

		vec4 color = texture2D(u_color_texture, v_coord);

		//Tonemapper
		color.rgb = tonemapUncharted2(color.rgb);

		//gamma
		color.rgb = pow(color.rgb, vec3(1./u_gamma));

		//contrast
		color.rgb = (color.rgb - vec3(0.5)) * u_contrast + vec3(0.5);

		//brightness
		color.rgb *= u_brightness;

		gl_FragColor = color;
	}