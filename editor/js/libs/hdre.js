/*
*   Alex Rodriguez
*   @jxarco 
*/

// hdre.js 

//main namespace
(function(global){

	/**
	 * Main namespace
	 * @namespace HDRE
	 */
	
	var FLO2BYTE = 4;
	var BYTE2BITS = 8;

	var U_BYTE		= 01;
	var HALF_FLOAT	= 02;
	var FLOAT		= 03;
	var U_BYTE_RGBE	= 04;

	var ARRAY_TYPES = {
		1: Uint8Array,
		2: Uint16Array,
		3: Float32Array,
		4: Uint8Array
	}

	var HDRE = global.HDRE = {

		version: 3.0,	// v1.5 adds spherical harmonics coeffs for the skybox
						// v2.0 adds byte padding for C++ uses				
						// v2.5 allows mip levels to be smaller than 8x8
						// v2.75 RGB format supported
						// v3.0 HDREImage and HDREBuilder
		maxFileSize: 60e6 // bytes
	};

	HDRE.DEFAULT 	= 0;
	HDRE.EXR 		= 1;
	HDRE.RADIANCE 	= 2;

	HDRE.CUBE_MAP_POSITIVE_X = 0;
	HDRE.CUBE_MAP_POSITIVE_Y = 1;
	HDRE.CUBE_MAP_POSITIVE_Z = 2;
	HDRE.CUBE_MAP_NEGATIVE_X = 3;
	HDRE.CUBE_MAP_NEGATIVE_Y = 4;
	HDRE.CUBE_MAP_NEGATIVE_Z = 5;
	
	HDRE.setup = function(o)
	{
		o = o || {};
		if(HDRE.configuration)
			throw("setup already called");
		HDRE.configuration = o;
	}
	
	/** HEADER STRUCTURE (256 bytes)
	 * Header signature ("HDRE" in ASCII)	   4 bytes
	 * Format Version						   4 bytes
	 * Width									2 bytes
	 * Height								   2 bytes
	 * Max file size							4 bytes
	 * Number of channels					   1 byte
	 * Bits per channel						 1 byte
	 * Header size								1 byte
	 * Max luminance							4 byte
	 * Flags									1 byte
	 */
	
	/**
	* This class stores all the HDRE data
	* @class HDREImage
	*/

	function HDREImage(header, data, o) {

		if(this.constructor !== HDREImage)
		throw("You must use new to create a HDREImage");

		this._ctor(header, data);

		if(o)
		this.configure(o);
	}

	HDRE.HDREImage = HDREImage;

	HDREImage.prototype._ctor = function(h, data) {

		//could I build hdre without header?
		h = h || {};

		// file info
		this.version = h["version"];

		// dimensions
		this.width = h["width"];
		this.height = h["height"];

		// channel info
		this.n_channels = h["nChannels"];
		this.bits_channel = h["bpChannel"];
		
		// image info
		this.data = data;
		this.type = ARRAY_TYPES[h["type"]];
		this.max_irradiance = h["maxIrradiance"];
		this.shs = h["shs"];
		this.size = h["size"];

		// store h just in case
		this.header = h;
	}
	
	HDREImage.prototype.configure = function(o) {

		o = o || {};

		this.is_rgbe = o.rgbe !== undefined ? o.rgbe : false;

		for(var k in o)
		this[k] = o[k];

		if(this.bits_channel === 32)
			this.type = Float32Array;
		else
			this.type = Uint8Array;

	}

	HDREImage.prototype.flipY = function() {

	}

	HDREImage.prototype.toTexture = function() {
		
		if(!window.GL)
			throw("this function requires to use litegl.js");

		var _envs = this.data;
		if(!_envs)
			return false;

		// Get base enviroment texture
		var tex_type = GL.FLOAT;
		var data = _envs[0].data;
		var w = this.width;

		if(this.type === Uint16Array) // HALF FLOAT
			tex_type = GL.HALF_FLOAT_OES;
		else if(this.type === Uint8Array) 
			tex_type = GL.UNSIGNED_BYTE;

		
		var flip_Y_sides = false;

		// "true" for using old environments
        // (not standard flipY)
		if(this.version < 3.0)
		flip_Y_sides = true;

		if(flip_Y_sides)
		{
			var tmp = data[2];
			data[2] = data[3];
			data[3] = tmp;
		}

		var options = {
			format: this.n_channels === 4 ? gl.RGBA : gl.RGB,
			type: tex_type,
			minFilter: gl.LINEAR_MIPMAP_LINEAR,
			texture_type: GL.TEXTURE_CUBE_MAP,
		};

		GL.Texture.disable_deprecated = true;

		var tex = new GL.Texture( w, w, options );
		tex.mipmap_data = {};

		// Generate mipmaps
		tex.bind(0);

		var num_mipmaps = Math.log(w) / Math.log(2);

		// Upload prefilter mipmaps
		for(var i = 0; i <= num_mipmaps; i++)
		{
			var level_info = _envs[i];
			var levelsize = Math.pow(2,num_mipmaps - i);

			if(level_info)
			{
				var pixels = level_info.data;

				if(flip_Y_sides && i > 0)
				{
					var tmp = pixels[2];
					pixels[2] = pixels[3];
					pixels[3] = tmp;
				}

				for(var f = 0; f < 6; ++f)
				{
					if(!flip_Y_sides && i == 0)
					{
						GL.Texture.flipYData( pixels[f], w, w, this.n_channels);
					}

					tex.uploadData( pixels[f], { cubemap_face: f, mipmap_level: i}, true );
				}
				tex.mipmap_data[i] = pixels;
			}
			else
			{
				var zero = new Float32Array(levelsize * levelsize * this.n_channels);
				for(var f = 0; f < 6; ++f)
					tex.uploadData( zero, { cubemap_face: f, mipmap_level: i}, true );
			}
		}

		GL.Texture.disable_deprecated = false;

		// Store the texture 
		tex.has_mipmaps = true;
		tex.data = null;
		tex.is_rgbe = this.is_rgbe;

		return tex;
	}

	/**
	* This class creates HDRE from different sources
	* @class HDREBuilder
	*/

	function HDREBuilder(o) {

		if(this.constructor !== HDREBuilder)
		throw("You must use new to create a HDREBuilder");

		this._ctor();

		if(o)
		this.configure(o);
	}
	
	HDRE.HDREBuilder = HDREBuilder;

	HDREBuilder.prototype._ctor = function() {

		this.flip_Y_sides = true;
		this.pool = {};
		this.last_id = 0;
	}

	HDREBuilder.prototype.configure = function(o) {

		o = o || {};
	}

	HDREBuilder.prototype.createImage = function(data, size) {

		if(!data)
		throw("[error] cannot create HDRE image");

		var texture = null;
		var image = new HDREImage();

		//create gpu texture from file
		if(data.constructor !== GL.Texture)
			texture = this.createTexture(data, size);
		else
			texture = data;
				
		image.configure({
			version: 3.0,
			width: texture.width,
			height: texture.height,
			n_channels: texture.format === GL.RGB ? 3 : 4,
			bits_channel: texture.type === GL.FLOAT ? 32 : 8,
			texture: texture,
			id: this.last_id
		})

		this.pool[this.last_id++] = image;
		console.log(this.pool);

		return image;
	}

	HDREBuilder.prototype.fromFile = function(buffer, options) {

		var image = HDRE.parse(buffer, options);
		this.pool[this.last_id++] = image;
		console.log(this.pool);

		if(options.callback)
		options.callback(image);

		return image;
	}

	HDREBuilder.prototype.fromHDR = function(filename, buffer, size) {

		var data, ext = filename.split('.').pop();

		switch (ext) {
			case "hdr":
				data = this._parseRadiance( buffer );
					break;
		
			case "exr":
				data = this._parseEXR( buffer );
					break;

			default:
				throw("cannot parse hdr file");
		}

		//add HDRE image to the pool
		return this.createImage(data, size);
	}

	HDREBuilder.prototype.fromTexture = function(texture) {

		this.filter(texture, {
			oncomplete: (function(result) {
				
				this.createImage(result);
				
			}).bind(this)
		});
	}

	/**
    * Create a texture based in data received as input 
    * @method CreateTexture
    * @param {Object} data 
    * @param {Number} cubemap_size
    */
   	HDREBuilder.prototype.createTexture = function( data, cubemap_size, options )
	{
		if(!window.GL)
		throw("this function requires to use litegl.js");

		if(!data)
		throw( "No data to get texture" );

		options = options || {};		

		var width = data.width,
			height = data.height;

		var is_cubemap = ( width/4 === height/3 && GL.isPowerOfTwo(width) ) ? true : false;

		var channels = data.numChannels;
		var pixelData = data.rgba;
		var pixelFormat = channels === 4 ? gl.RGBA : gl.RGB; // EXR and HDR files are written in 4 

		if(!width || !height)
		throw( 'No width or height to generate Texture' );

		if(!pixelData)
		throw( 'No data to generate Texture' );

		var texture = null;

		var params = {
			format: pixelFormat,
			type: gl.FLOAT,
			pixel_data: pixelData
		};

		GL.Texture.disable_deprecated = true;

		// 1 image cross cubemap
		if(is_cubemap)
		{
			var square_length = pixelData.length / 12;
			var faces = parseFaces(square_length, width, height, pixelData);

			width /= 4;
			height /= 3;

			params.texture_type = GL.TEXTURE_CUBE_MAP;
			params.pixel_data = faces;

			texture = new GL.Texture( width, height, params);

			var temp = texture.clone();
			var shader = new GL.Shader(Shader.SCREEN_VERTEX_SHADER, HDRE.CopyCubemap_Shader_Fragment);
			
			//save state
			var current_fbo = gl.getParameter( gl.FRAMEBUFFER_BINDING );
			var viewport = gl.getViewport();
			var fb = gl.createFramebuffer();
			gl.bindFramebuffer( gl.FRAMEBUFFER, fb );
			gl.viewport(0,0, width, height);

			var mesh = Mesh.getScreenQuad();
			
			// Bind original texture
			texture.bind(0);
			mesh.bindBuffers( shader );
			shader.bind();

			var rot_matrix = GL.temp_mat3;
			var cams = GL.Texture.cubemap_camera_parameters;

			for(var i = 0; i < 6; i++)
			{
				gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, temp.handler, 0);
				var face_info = cams[i];

				mat3.identity( rot_matrix );
				rot_matrix.set( face_info.right, 0 );
				rot_matrix.set( face_info.up, 3 );
				rot_matrix.set( face_info.dir, 6 );
				shader._setUniform( "u_rotation", rot_matrix );
				shader._setUniform( "u_flip", true );
				gl.drawArrays( gl.TRIANGLES, 0, 6 );
			}

			mesh.unbindBuffers( shader );
			//restore previous state
			gl.setViewport(viewport); //restore viewport
			gl.bindFramebuffer( gl.FRAMEBUFFER, current_fbo ); //restore fbo
			gl.bindTexture(temp.texture_type, null); //disable

			temp.is_cubemap = is_cubemap;
		}

		// basic texture or sphere map
		else 
		{
			texture = new GL.Texture( width, height, params);
		}
			
		// texture properties
		texture.wrapS = gl.CLAMP_TO_EDGE;
		texture.wrapT = gl.CLAMP_TO_EDGE;
		texture.magFilter = gl.LINEAR;
		texture.minFilter = gl.LINEAR_MIPMAP_LINEAR;

		if(is_cubemap)
			return temp;

		if(!options.discard_spheremap)
			gl.textures["tmp_spheremap"] = texture;

		
		var result = this.toCubemap( texture, cubemap_size );
		GL.Texture.disable_deprecated = false;

		return result;
	}

	/**
	 * Converts spheremap or panoramic map to a cubemap texture 
	 * @method ToCubemap
	 * @param {Texture} tex
	 * @param {Number} cubemap_size
	 */
	HDREBuilder.prototype.toCubemap = function( tex, cubemap_size )
	{
		var size = cubemap_size || this.CUBE_MAP_SIZE;
		if(!size)
		throw( "CUBEMAP size not defined" );

		//save state
		var current_fbo = gl.getParameter( gl.FRAMEBUFFER_BINDING );
		var viewport = gl.getViewport();
		var fb = gl.createFramebuffer();
		gl.bindFramebuffer( gl.FRAMEBUFFER, fb );
		gl.viewport(0,0, size, size);

		var shader_type = (tex.width == tex.height * 2) ? HDRE.LatLong_Shader_Fragment : HDRE.Spheremap_Shader_Fragment;
		var shader = new GL.Shader(Shader.SCREEN_VERTEX_SHADER, shader_type);

		if(!shader)
			throw( "No shader" );

		// Bind original texture
		tex.bind(0);
		var mesh = Mesh.getScreenQuad();
		mesh.bindBuffers( shader );
		shader.bind();

		var cubemap_texture = new GL.Texture( size, size, { format: tex.format, texture_type: GL.TEXTURE_CUBE_MAP, type: gl.FLOAT, minFilter: GL.LINEAR_MIPMAP_LINEAR } );
		var rot_matrix = GL.temp_mat3;
		var cams = GL.Texture.cubemap_camera_parameters;

		for(var i = 0; i < 6; i++)
		{
			gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, cubemap_texture.handler, 0);
			var face_info = cams[i];

			mat3.identity( rot_matrix );
			rot_matrix.set( face_info.right, 0 );
			rot_matrix.set( face_info.up, 3 );
			rot_matrix.set( face_info.dir, 6 );
			shader._setUniform( "u_rotation", rot_matrix );
			gl.drawArrays( gl.TRIANGLES, 0, 6 );
		}

		mesh.unbindBuffers( shader );

		//restore previous state
		gl.setViewport(viewport); //restore viewport
		gl.bindFramebuffer( gl.FRAMEBUFFER, current_fbo ); //restore fbo
		gl.bindTexture(cubemap_texture.texture_type, null); //disable

		var pixels = cubemap_texture.getCubemapPixels();

		if(this.flip_Y_sides)
		{
			var tmp = pixels[2];
			pixels[2] = pixels[3];
			pixels[3] = tmp;
		}

		for(var f = 0; f < 6; ++f)
		{
			if(this.flip_Y_sides)
				GL.Texture.flipYData(pixels[f], size, size, tex.format === GL.RGBA ? 4 : 3);

			cubemap_texture.uploadData( pixels[f], { cubemap_face: f} );
		}
			

		return cubemap_texture;
	}

	/**
	 * Blurs each of the level of a given environment texture
	 * @method Filter
	 * @param {Texture} texture
	 * @param {Object} options
	 */
	HDREBuilder.prototype.filter = function(texture, options) {

		if(!window.GL)
			throw("this function requires to use litegl.js");

        var options = options || {};

		if(!texture)
		throw("no texture to filter");

        var shader = new Shader(HDRE.Filter_Shader_Vertex, HDRE.Filter_Shader_Fragment);
		var mipCount = 5;

		//Reset Builder steps
		this.LOAD_STEPS = 0;
		this.CURRENT_STEP = 0;

		//Clean previous mipmap data
		texture.mipmap_data = {
			0: texture.getCubemapPixels()
		};

		// compute necessary steps
		for( var i = 1; i <= mipCount; ++i )
		{
			var faces = 6;
			var blocks = Math.min(texture.width / Math.pow( 2, i ), 8);
			this.LOAD_STEPS += faces * blocks;
		}

		GL.Texture.disable_deprecated = true;

		for( let mip = 1; mip <= mipCount; mip++ )
		{
			this._blur( texture, mip, mipCount, shader, (function(result) {

				var pixels = result.getCubemapPixels();

				//data always comes in rgba when reading pixels from textures
				if(texture.format == GL.RGB)
				{
					for(var f = 0; f < 6; ++f)
						pixels[f] = _removeAlphaChannel(pixels[f]);
				}

				texture.mipmap_data[mip] = pixels;

				/*if(this.flip_Y_sides)
				{
					var tmp = pixels[2];
					pixels[2] = pixels[3];
					pixels[3] = tmp;
				}*/

				for(var f = 0; f < 6; ++f)
					texture.uploadData( pixels[f], { cubemap_face: f, mipmap_level: mip}, true );

				if(this.CURRENT_STEP == this.LOAD_STEPS)
				{
					texture.data = null;

					// format is stored different when reading hdre files!! 
					if(options.image_id)
					this.pool[options.image_id].data = texture.mipmap_data;

					if(options.oncomplete)
						options.oncomplete(texture);

					GL.Texture.disable_deprecated = false;
				}

			}).bind(this));
		}
	}

	/**
    * Blurs a texture calling different draws from data
    * @method blur
    * @param {Texture} input
    * @param {Number} level
    * @param {Shader||String} shader
    */
   	HDREBuilder.prototype._blur = function(input, level, mipCount, shader, oncomplete)
	{
		var data = this._getDrawData(input, level, mipCount);
	
		if(!data)
		throw('no data to blur');
		
		// var channels = 

		var options = {
			format: input.format, //gl.RGBA,
			type: GL.FLOAT,
			minFilter: gl.LINEAR_MIPMAP_LINEAR,
			texture_type: GL.TEXTURE_CUBE_MAP
		};

		var result = new GL.Texture( data.size, data.size, options );
		var current_draw = 0;

		//save state
		var current_fbo = gl.getParameter( gl.FRAMEBUFFER_BINDING );
		var viewport = gl.getViewport();

		var fb = gl.createFramebuffer();
		var mesh = GL.Mesh.getScreenQuad();

		var inner_blur = function() {

			let drawInfo = data.draws[current_draw];
			drawInfo.uniforms["u_mipCount"] = mipCount;
			drawInfo.uniforms["u_emsize"] = input.width;

			if(!shader)
				throw( "No shader" );
	
			// bind blur fb each time 
			gl.bindFramebuffer( gl.FRAMEBUFFER, fb );

			input.bind(0);
			shader.bind();
			mesh.bindBuffers( shader );

			gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + drawInfo.face, result.handler, 0);
			gl.viewport( drawInfo.viewport[0], drawInfo.viewport[1], drawInfo.viewport[2], drawInfo.viewport[3] );
			
			shader.uniforms( drawInfo.uniforms );
			gl.drawArrays( gl.TRIANGLES, 0, 6 );

			mesh.unbindBuffers( shader );
			input.unbind();

			//restore previous state each draw
			gl.setViewport(viewport); //restore viewport
			gl.bindFramebuffer( gl.FRAMEBUFFER, current_fbo ); //restore fbo
			gl.bindTexture(result.texture_type, null);
		}

		var that = this;

		var interval = setInterval( function() {

			inner_blur();
			current_draw++;

			that.CURRENT_STEP++;
			
			if(current_draw == data.draws.length)
			{
				clearInterval(interval);

				if(oncomplete)
					oncomplete( result );
			}
	   }, 100 );
   }

	/**
   * Gets info to blur in later pass
   * @method getDrawData
   * @param {Texture} input
   * @param {Number} level
   * @param {Shader} shader
   */
  	HDREBuilder.prototype._getDrawData = function(input, level, mipCount)
   	{
		var blocks = 8;

		var size = input.height; // by default
		size /= Math.pow(2, level);

		// Recompute number of blocks
		blocks = Math.min(blocks, size);

		var totalLevels = mipCount;
		var roughness = (level+1) / (totalLevels + 1);

		var deferredInfo = {};

		var cams = GL.Texture.cubemap_camera_parameters;
		var cubemap_cameras = [];
		var draws = [];

		for( let c in cams ) {

			let face_info = cams[c];
			let rot_matrix = mat3.create();
			mat3.identity( rot_matrix );
			rot_matrix.set( face_info.right, 0 );
			rot_matrix.set( face_info.up, 3 );
			rot_matrix.set( face_info.dir, 6 );
			cubemap_cameras.push( rot_matrix );
		}

		cubemap_cameras = GL.linearizeArray( cubemap_cameras );
		
		for(var i = 0; i < 6; i++)
		{
			var face_info = cams[i];

			let rot_matrix = mat3.create();
			mat3.identity( rot_matrix );
			rot_matrix.set( face_info.right, 0 );
			rot_matrix.set( face_info.up, 3 );
			rot_matrix.set( face_info.dir, 6 );

			for( var j = 0; j < blocks; j++ )
			{
				let uniforms = {
						'u_rotation': rot_matrix,
						'u_blocks': blocks,
						'u_mipCount': mipCount,
						'u_roughness': roughness,
						'u_ioffset': j * (1/blocks),
						'u_cameras': cubemap_cameras,
						'u_color_texture': 0
					};

				let blockSize = size/blocks;

				draws.push({
					uniforms: uniforms, 
					viewport: [j * blockSize, 0, blockSize, size],
					face: i
				});
			}
		}

		deferredInfo['blocks'] = blocks;
		deferredInfo['draws'] = draws;
		deferredInfo['size'] = size;
		deferredInfo['roughness'] = roughness;
		deferredInfo['level'] = level;

		return deferredInfo;
	}

	/**
    * Parse the input data and get all the EXR info 
    * @method _parseEXR
    * @param {ArrayBuffer} buffer 
    */
   	HDREBuilder.prototype._parseEXR = function( buffer )
	{
		if(!Module.EXRLoader)
			console.error('[cannot parse exr file] this function needs tinyexr.js to work');

		function parseNullTerminatedString( buffer, offset ) {

			var uintBuffer = new Uint8Array( buffer );
			var endOffset = 0;
		
			while ( uintBuffer[ offset.value + endOffset ] != 0 ) 
				endOffset += 1;
		
			var stringValue = new TextDecoder().decode(
			new Uint8Array( buffer ).slice( offset.value, offset.value + endOffset )
			);
		
			offset.value += (endOffset + 1);
		
			return stringValue;
		
		}
		
		function parseFixedLengthString( buffer, offset, size ) {
		
			var stringValue = new TextDecoder().decode(
			new Uint8Array( buffer ).slice( offset.value, offset.value + size )
			);
		
			offset.value += size;
		
			return stringValue;
		
		}

		
		function parseUint32( buffer, offset ) {
		
			var Uint32 = new DataView( buffer.slice( offset.value, offset.value + 4 ) ).getUint32( 0, true );
			offset.value += 4;
			return Uint32;
		}
		
		function parseUint8( buffer, offset ) {
		
			var Uint8 = new DataView( buffer.slice( offset.value, offset.value + 1 ) ).getUint8( 0, true );
			offset.value += 1;
			return Uint8;
		}
		
		function parseFloat32( buffer, offset ) {
		
			var float = new DataView( buffer.slice( offset.value, offset.value + 4 ) ).getFloat32( 0, true );
			offset.value += 4;
			return float;
		}
		
		function parseUint16( buffer, offset ) {
		
			var Uint16 = new DataView( buffer.slice( offset.value, offset.value + 2 ) ).getUint16( 0, true );
			offset.value += 2;
			return Uint16;
		}
		
		function parseChlist( buffer, offset, size ) {
		
			var startOffset = offset.value;
			var channels = [];
		
			while ( offset.value < ( startOffset + size - 1 ) ) {
		
				var name = parseNullTerminatedString( buffer, offset );
				var pixelType = parseUint32( buffer, offset ); // TODO: Cast this to UINT, HALF or FLOAT
				var pLinear = parseUint8( buffer, offset );
				offset.value += 3; // reserved, three chars
				var xSampling = parseUint32( buffer, offset );
				var ySampling = parseUint32( buffer, offset );
			
				channels.push( {
					name: name,
					pixelType: pixelType,
					pLinear: pLinear,
					xSampling: xSampling,
					ySampling: ySampling
				} );
			}
		
			offset.value += 1;
		
			return channels;
		}
		
		function parseChromaticities( buffer, offset ) {
		
			var redX = parseFloat32( buffer, offset );
			var redY = parseFloat32( buffer, offset );
			var greenX = parseFloat32( buffer, offset );
			var greenY = parseFloat32( buffer, offset );
			var blueX = parseFloat32( buffer, offset );
			var blueY = parseFloat32( buffer, offset );
			var whiteX = parseFloat32( buffer, offset );
			var whiteY = parseFloat32( buffer, offset );
		
			return { redX: redX, redY: redY, greenX, greenY, blueX, blueY, whiteX, whiteY };
		}
		
		function parseCompression( buffer, offset ) {
		
			var compressionCodes = [
			'NO_COMPRESSION',
			'RLE_COMPRESSION',
			'ZIPS_COMPRESSION',
			'ZIP_COMPRESSION',
			'PIZ_COMPRESSION'
			];
		
			var compression = parseUint8( buffer, offset );
		
			return compressionCodes[ compression ];
		
		}
		
		function parseBox2i( buffer, offset ) {
		
			var xMin = parseUint32( buffer, offset );
			var yMin = parseUint32( buffer, offset );
			var xMax = parseUint32( buffer, offset );
			var yMax = parseUint32( buffer, offset );
		
			return { xMin: xMin, yMin: yMin, xMax: xMax, yMax: yMax };
		}
		
		function parseLineOrder( buffer, offset ) {
		
			var lineOrders = [
			'INCREASING_Y'
			];
		
			var lineOrder = parseUint8( buffer, offset );
		
			return lineOrders[ lineOrder ];
		}
		
		function parseV2f( buffer, offset ) {
		
			var x = parseFloat32( buffer, offset );
			var y = parseFloat32( buffer, offset );
		
			return [ x, y ];
		}
		
		function parseValue( buffer, offset, type, size ) {
		
			if ( type == 'string' || type == 'iccProfile' ) {
				return parseFixedLengthString( buffer, offset, size );
			} else if ( type == 'chlist' ) {
				return parseChlist( buffer, offset, size );
			} else if ( type == 'chromaticities' ) {
				return parseChromaticities( buffer, offset );
			} else if ( type == 'compression' ) {
				return parseCompression( buffer, offset );
			} else if ( type == 'box2i' ) {
				return parseBox2i( buffer, offset );
			} else if ( type == 'lineOrder' ) {
				return parseLineOrder( buffer, offset );
			} else if ( type == 'float' ) {
				return parseFloat32( buffer, offset );
			} else if ( type == 'v2f' ) {
				return parseV2f( buffer, offset );
			} 
		}

		var EXRHeader = {};

		var magic = new DataView( buffer ).getUint32( 0, true );
		var versionByteZero = new DataView( buffer ).getUint8( 4, true );
		var fullMask = new DataView( buffer ).getUint8( 5, true );

		// Start parsing header
		var offset = { value: 8 };
		var keepReading = true;

		// clone buffer
		buffer = buffer.slice(0);

		while( keepReading )
		{
			var attributeName = parseNullTerminatedString( buffer, offset );

			if ( attributeName == 0 )
				keepReading = false;
			else
			{
				var attributeType = parseNullTerminatedString( buffer, offset );
				var attributeSize = parseUint32( buffer, offset );
				var attributeValue = parseValue( buffer, offset, attributeType, attributeSize );
				EXRHeader[ attributeName ] = attributeValue;
			}
		}

		if (EXRHeader.compression === undefined)
		throw "EXR compression is undefined";

		var width = EXRHeader.dataWindow.xMax - EXRHeader.dataWindow.xMin + 1;
		var height = EXRHeader.dataWindow.yMax - EXRHeader.dataWindow.yMin + 1;
		var numChannels = EXRHeader.channels.length;

		var byteArray;

		//if (EXRHeader.compression === 'ZIP_COMPRESSION' || EXRHeader.compression == 'NO_COMPRESSION') {

			// get all content from the exr
			try {
				var data = new Uint8Array(buffer);
				var exr = new Module.EXRLoader(data);

				if(exr.ok())
					byteArray = exr.getBytes();
				else 
					throw( "Error getting bytes from EXR file" );

			} catch (error) {
				console.error(error);
			}

		/* }
		else
		{
			console.error('Cannot decompress unsupported compression');
			return; 
		}*/

		var data = {
			header: EXRHeader,
			width: width,
			height: height,
			rgba: byteArray,
			numChannels: numChannels
		};

		return data;
	}

	/**
    * Parse the input data and get all the HDR (radiance file) info 
    * @method parseRadiance
    * @param {ArrayBuffer} buffer 
    */
	HDREBuilder.prototype._parseRadiance = function( buffer )
	{
		if(!parseHdr)
			console.error('[cannot parse hdr file] this function needs hdr-parser.js to work');
		
		var img = parseHdr(buffer);

		var data = {
			header: null,
			width: img.shape[0],
			height: img.shape[1],
			rgba: img.data,
			numChannels: img.data.length/(img.shape[0]*img.shape[1])
		};

		return data;
	}
	   
	/* 
		General HDRE Functions: Write, load, parse
	*/

	/**
	* Write and download an HDRE
	* @method write
	* @param {Object} mips_data - [lvl0: { w, h, pixeldata: [faces] }, lvl1: ...]
	* @param {Number} width
	* @param {Number} height
	* @param {Object} options
	*/
	HDRE.write = function( mips_data, width, height, options )
	{
		options = options || {};

		var array_type = Float32Array;
		
		if(options.type && options.type.BYTES_PER_ELEMENT)
			array_type = options.type;

		var RGBE = options.rgbe !== undefined ? options.rgbe : false;

		/*
		*   Create header
		*/

		// get total pixels
		var size = 0;
		for(var i = 0; i < mips_data.length; i++)
			size += mips_data[i].width * mips_data[i].height;

		// File format information
		var numFaces = 6;
		var numChannels = options.channels || 4;
		var headerSize = 256; // Bytes (256 in v2.0)
		var contentSize = size * numFaces * numChannels * array_type.BYTES_PER_ELEMENT; // Bytes
		var fileSize = headerSize + contentSize; // Bytes
		var bpChannel = array_type.BYTES_PER_ELEMENT * BYTE2BITS; // Bits

		var contentBuffer = new ArrayBuffer(fileSize);
		var view = new DataView(contentBuffer);

		var LE = true;// little endian

		// Signature: "HDRE" in ASCII
		// 72, 68, 82, 69

		// Set 4 bytes of the signature
		view.setUint8(0, 72);
		view.setUint8(1, 68);
		view.setUint8(2, 82);
		view.setUint8(3, 69);
		
		// Set 4 bytes of version
		view.setFloat32(4, this.version, LE);

		// Set 2 bytes of width, height
		view.setUint16(8, width, LE);
		view.setUint16(10, height, LE);
		// Set max file size
		view.setFloat32(12, this.maxFileSize, LE);

		// Set rest of the bytes
		view.setUint16(16, numChannels, LE); // Number of channels
		view.setUint16(18, bpChannel, LE); // Bits per channel
		view.setUint16(20, headerSize, LE); // max header size
		view.setUint16(22, LE ? 1 : 0, LE); // endian encoding

		/*
		*   Create data
		*/
		
		var data = new array_type(size * numFaces * numChannels);
		var offset = 0;

		for(var i = 0; i < mips_data.length; i++)
		{
			let _env = mips_data[i],
				w = _env.width,
				h = _env.height,
				s = w * h * numChannels;

			var suboff = 0;

			for(var f = 0; f < numFaces; f++) {
				var subdata = _env.pixelData[f];

				// remove alpha channel to save storage
				if(numChannels === 3)
					subdata = _removeAlphaChannel( subdata );

				data.set( subdata, offset + suboff);
				suboff += subdata.length;
			}

			// Apply offset
			offset += (s * numFaces);
		}

		// set max value for luminance
		view.setFloat32(24, _getMax( data ), LE); 

		var type = FLOAT;
		if( array_type === Uint8Array)
			type = U_BYTE;
		if( array_type === Uint16Array)
			type = HALF_FLOAT;

		if(RGBE)
			type = U_BYTE_RGBE;
			
		// set write array type 
		view.setUint16(28, type, LE); 

		// SH COEFFS
		if(options.sh) {
		
			var SH = options.sh;

			view.setUint16(30, 1, LE);
			view.setFloat32(32, SH.length / 3, LE); // number of coeffs
			var pos = 36;
			for(var i = 0; i < SH.length; i++) {
				view.setFloat32(pos, SH[i], LE); 
				pos += 4;
			}
		}
		else
			view.setUint16(30, 0, LE);

		/*
		*  END OF HEADER
		*/

		offset = headerSize;

		// Set data into the content buffer
		for(var i = 0; i < data.length; i++)
		{
			if(type == U_BYTE || type == U_BYTE_RGBE) {
				view.setUint8(offset, data[i]);
			}else if(type == HALF_FLOAT) {
				view.setUint16(offset, data[i], true);
			}else {
				view.setFloat32(offset, data[i], true);
			}

			offset += array_type.BYTES_PER_ELEMENT;
		}

		// Return the ArrayBuffer with the content created
		return contentBuffer;
	}

	function _getMax(data) {
		return data.reduce((max, p) => p > max ? p : max, data[0]);
	}

	function _removeAlphaChannel(data) {
		var tmp_data = new Float32Array(data.length * 0.75);
		var index = k = 0;
		data.forEach( function(a, b){  
			if(index < 3) {
				tmp_data[k++] = a;  
				index++;
			} else {
				index = 0;
			}
		});
		return tmp_data;
	}

	window.getMaxOfArray = _getMax;

	/**
	* Read file
	* @method read
	* @param {String} file 
	*/
	HDRE.load = function( url, callback )
	{
		var xhr = new XMLHttpRequest();
		xhr.responseType = "arraybuffer";
		xhr.open( "GET", url, true );
		xhr.onload = (e) => {
		if(e.target.status == 404)
			return;
		var data = HDRE.parse(e.target.response);
		if(callback)
			callback(data);
		}
		xhr.send();
	}
	
	//legacy
	HDRE.read = function( url, callback )
	{
	   console.warn("Legacy function, use HDRE.load instead of HDRE.read");
	   return HDRE.load( url, callback );
	}

	/**
	* Parse the input data and create texture
	* @method parse
	* @param {ArrayBuffer} buffer 
	* @param {Function} options (oncomplete, onprogress, filename, ...)
	*/
	HDRE.parse = function( buffer, options )
	{
		if(!buffer)
			throw( "No data buffer" );

		var options = options || {};
		var fileSizeInBytes = buffer.byteLength;
		var LE = true;

		/*
		*   Read header
		*/

		// Read signature
		var sg = parseSignature( buffer, 0 );

		// Read version
		var v = parseFloat32(buffer, 4, LE);

		// Get 2 bytes of width, height
		var w = parseUint16(buffer, 8, LE);
		var h = parseUint16(buffer, 10, LE);
		// Get max file size in bytes
		var m = parseFloat(parseFloat32(buffer, 12, LE));

		// Set rest of the bytes
		var c = parseUint16(buffer, 16, LE);
		var b = parseUint16(buffer, 18, LE);
		var s = parseUint16(buffer, 20, LE);
		var isLE = parseUint16(buffer, 22, LE);

		var i = parseFloat(parseFloat32(buffer, 24, LE));
		var a = parseUint16(buffer, 28, LE);

		var shs = null;
		var hasSH = parseUint16(buffer, 30, LE);

		if(hasSH) {
			var Ncoeffs = parseFloat32(buffer, 32, LE) * 3;
			shs = [];
			var pos = 36;

			for(var i = 0; i < Ncoeffs; i++)  {
				shs.push( parseFloat32(buffer, pos, LE) );
				pos += 4;
			}
		}

		var header = {
			version: v,
			signature: sg,
			type: a,
			width: w,
			height: h,
			nChannels: c,
			bpChannel: b,
			maxIrradiance: i,
			shs: shs,
			encoding: isLE,
			size: fileSizeInBytes
		};

		// console.table(header);
		window.parsedFile = HDRE.last_parsed_file = { buffer: buffer, header: header };
		
		if(v < 2 || v > 1e3){ // bad encoding
			console.error('old version, please update the HDRE');
			return false;
		}
		if(fileSizeInBytes > m){
			console.error('file too big');
			return false;
		}


		/*
		*   BEGIN READING DATA
		*/

		var dataBuffer = buffer.slice(s);
		var array_type = ARRAY_TYPES[header.type];

		var dataSize = dataBuffer.byteLength / 4;
		var data = new array_type(dataSize);
		var view = new DataView(dataBuffer);
		
		var pos = 0;

		for(var i = 0 ; i < dataSize; i++)
		{
			data[i] = view.getFloat32(pos, LE);
			pos += 4;
		}

		var numChannels = c;

		var ems = [],
			precomputed = [];

		var offset = 0;
		var originalWidth = w;

		for(var i = 0; i < 6; i++)
		{
			var mip_level = i + 1;
			var offsetEnd = w * w * numChannels * 6;
			ems.push( data.slice(offset, offset + offsetEnd) );
			offset += offsetEnd;
		
			if(v > 2.0)
				w = originalWidth / Math.pow(2, mip_level);
			else
				w = Math.max(8, originalWidth / Math.pow(2, mip_level));
		}

		/*
			Get bytes
		*/
		
		// care about new sizes (mip map chain)
		w = header.width;

		for(var i = 0; i < 6; i++)
		{
			var bytes = ems[i];
		
			// Reorder faces
			var faces = [];
			var bPerFace = bytes.length / 6;

			var offset = 0;

			for(var j = 0; j < 6; j++)
			{
				faces[j] = new array_type(bPerFace);

				var subdata = bytes.slice(offset, offset + (numChannels * w * w));
				faces[j].set(subdata);

				offset += (numChannels * w * w);
			}

			precomputed.push( {
				data: faces,
				width: w
			});

			// resize next textures
			var mip_level = i + 1;
			
			if(v > 2.0)
				w = originalWidth / Math.pow(2, mip_level);
			else
				w = Math.max(8, originalWidth / Math.pow(2, mip_level));

			if(options.onprogress)
				options.onprogress( i );
		}

		var image = new HDREImage(header, precomputed, options);
		return image;
	}

	// Shader Code

	//Read environment mips
	HDRE.read_cubemap_fs = '\
		vec3 readPrefilteredCube(samplerCube cube_texture, float roughness, vec3 R) {\n\
			float f = roughness * 5.0;\n\
			vec3 color = textureCubeLodEXT(cube_texture, R, f).rgb;\n\
			return color;\n\
		}\n\
	';

	//Show SHs
	HDRE.irradiance_shs_fs = '\
		varying vec3 v_normal;\n\
		uniform vec3 u_sh_coeffs[9];\n\
		\n\
		const float Pi = 3.141592654;\n\
		const float CosineA0 = Pi;\n\
		const float CosineA1 = (2.0 * Pi) / 3.0;\n\
		const float CosineA2 = Pi * 0.25;\n\
		\n\
		struct SH9 { float c[9]; };\n\
		struct SH9Color { vec3 c[9]; };\n\
		\n\
		void SHCosineLobe(in vec3 dir, out SH9 sh)\n\
		{\n\
			// Band 0\n\
			sh.c[0] = 0.282095 * CosineA0;\n\
			\n\
			// Band 1\n\
			sh.c[1] = 0.488603 * dir.y * CosineA1;\n\
			sh.c[2] = 0.488603 * dir.z * CosineA1;\n\
			sh.c[3] = 0.488603 * dir.x * CosineA1;\n\
			\n\
			sh.c[4] = 1.092548 * dir.x * dir.y * CosineA2;\n\
			sh.c[5] = 1.092548 * dir.y * dir.z * CosineA2;\n\
			sh.c[6] = 0.315392 * (3.0 * dir.z * dir.z - 1.0) * CosineA2;\n\
			sh.c[7] = 1.092548 * dir.x * dir.z * CosineA2;\n\
			sh.c[8] = 0.546274 * (dir.x * dir.x - dir.y * dir.y) * CosineA2;\n\
		}\n\
		\n\
		vec3 ComputeSHDiffuse(in vec3 normal)\n\
		{\n\
			SH9Color shs;\n\
			for(int i = 0; i < 9; ++i)\n\
				shs.c[i] = u_sh_coeffs[i];\n\
			\n\
			// Compute the cosine lobe in SH, oriented about the normal direction\n\
			SH9 shCosine;\n\
			SHCosineLobe(normal, shCosine);\n\
			\n\
			// Compute the SH dot product to get irradiance\n\
			vec3 irradiance = vec3(0.0);\n\
			const int num = 9;\n\
			for(int i = 0; i < num; ++i)\n\
				irradiance += radiance.c[i] * shCosine.c[i];\n\
			\n\
			vec3 shDiffuse = irradiance * (1.0 / Pi);\n\
			\n\
			return irradiance;\n\
		}\n\
	';

	HDRE.Filter_Shader_Vertex = '\
		precision highp float;\n\
		attribute vec2 a_coord;\n\
		uniform float u_ioffset;\n\
		uniform float u_blocks;\n\
		varying vec3 v_dir;\n\
		varying vec2 v_coord;\n\
		void main() {\n\
			vec2 uv = a_coord;\n\
			uv.x /= u_blocks;\n\
			uv.x += u_ioffset;\n\
			v_coord = uv;\n\
			v_dir = vec3( uv - vec2(0.5), 0.5 );\n\
			//v_dir.y = -v_dir.y;\n\
			gl_Position = vec4(vec3(a_coord * 2.0 - 1.0, 0.5), 1.0);\n\
		}\n\
	';

	HDRE.Filter_Shader_Fragment = '\
		#extension GL_EXT_shader_texture_lod : enable\n\
		precision highp float;\n\
		\n\
		uniform samplerCube u_color_texture;\n\
		uniform mat3 u_cameras[6]; \n\
		uniform mat3 u_rotation;\n\
		uniform float u_roughness;\n\
		uniform vec4 u_viewport; \n\
		\n\
		uniform float u_mipCount;\n\
		uniform float u_emsize;\n\
		varying vec3 v_dir;\n\
		varying vec2 v_coord;\n\
		const float PI = 3.1415926535897932384626433832795;\n\
		const float size = 512.0;\n\
		void main() {\n\
			vec3 N = normalize( u_rotation * v_dir );\n\
			vec4 color = vec4(0.0);\n\
			float roughness = clamp(u_roughness, 0.0045, 0.98);\n\
			float alphaRoughness = roughness * roughness;\n\
			float lod = clamp(roughness * u_mipCount, 0.0, u_mipCount);\n\
			const float step = 2.0;\n\
			float cfs = u_emsize / pow(2.0, lod);\n\
			\n\
			for(float i = 0.5; i < size; i+=step)\n\
			for(float j = 0.5; j < size; j+=step) {\n\
				if(i > u_emsize || j > u_emsize)\n\
				break;\n\
				// Get pixel\n\
				vec2 r_coord = vec2(i, j) / vec2(u_emsize, u_emsize);\n\
				// Get 3d vector\n\
				vec3 dir = vec3( r_coord - vec2(0.5), 0.5 );\n\
				\n\
				// Use all faces\n\
				for(int iface = 0; iface < 6; iface++) {\n\
					\n\
					mat3 _camera_rotation = u_cameras[iface];\n\
					vec3 pixel_normal = normalize( _camera_rotation * dir );\n\
					float dotProduct = max(0.0, dot(N, pixel_normal));\n\
					float glossScale = 8.0;\n\
					float glossFactor = (1.0 - roughness );\n\
					float cmfs = u_emsize/pow(2.0, lod);\n\
					float weight = pow(dotProduct, cmfs * glossFactor * glossScale );\n\
					if(weight > 0.0 ) {\n\
						color.rgb += textureCube(u_color_texture, pixel_normal).rgb * weight;\n\
						color.a += weight;\n\
					}\n\
				}\n\
			}\n\
			float invWeight = 1.0/color.a;\n\
			gl_FragColor = vec4(color.rgb * invWeight, 1.0);\n\
		}\n\
	';

	HDRE.CopyCubemap_Shader_Fragment = '\
		precision highp float;\n\
		varying vec2 v_coord;\n\
		uniform vec4 u_color;\n\
		uniform vec4 background_color;\n\
		uniform vec3 u_camera_position;\n\
		uniform samplerCube u_color_texture;\n\
		uniform mat3 u_rotation;\n\
		uniform bool u_flip;\n\
		void main() {\n\
			vec2 uv = vec2( v_coord.x, 1.0 - v_coord.y );\n\
			vec3 dir = vec3( uv - vec2(0.5), 0.5 );\n\
			dir = u_rotation * dir;\n\
			if(u_flip)\n\
				dir.x *= -1.0;\n\
			gl_FragColor = textureCube(u_color_texture, dir);\n\
		}\n\
	';

	HDRE.Spheremap_Shader_Fragment = '\
		precision highp float;\n\
		varying vec2 v_coord;\n\
		uniform vec4 u_color;\n\
		uniform vec4 background_color;\n\
		uniform vec3 u_camera_position;\n\
		uniform sampler2D u_color_texture;\n\
		uniform mat3 u_rotation;\n\
		vec2 getSphericalUVs(vec3 dir)\n\
		{\n\
			dir = normalize(dir);\n\
			float d = sqrt(dir.x * dir.x + dir.y * dir.y);\n\
			float r = 0.0;\n\
			if(d > 0.0)\n\
				r = 0.159154943 * acos(dir.z) / d;\n\
			float u = 0.5 + dir.x * (r);\n\
			float v = 0.5 + dir.y * (r);\n\
			return vec2(u, v);\n\
		}\n\
		\n\
		void main() {\n\
			vec2 uv = vec2( v_coord.x, v_coord.y );\n\
			vec3 dir = vec3( uv - vec2(0.5), 0.5 );\n\
			dir = u_rotation * dir;\n\
			dir = -dir;\n\
			dir.x = -dir.x;\n\
			vec2 spherical_uv = getSphericalUVs( dir );\n\
			vec4 color = texture2D(u_color_texture, spherical_uv);\n\
			gl_FragColor = color;\n\
		}\n\
	';

	HDRE.LatLong_Shader_Fragment = '\
		precision highp float;\n\
		varying vec2 v_coord;\n\
		uniform vec4 u_color;\n\
		uniform vec4 background_color;\n\
		uniform vec3 u_camera_position;\n\
		uniform sampler2D u_color_texture;\n\
		uniform mat3 u_rotation;\n\
		#define PI 3.1415926535897932384626433832795\n\
		\n\
		vec2 getPanoramicUVs(vec3 dir)\n\
		{\n\
			dir = normalize(dir);\n\
			float u = 1.0 + (atan(dir.x, -dir.z) / PI);\n\
			float v = acos(dir.y) / PI;\n\
			return vec2(u/2.0, v);\n\
		}\n\
		\n\
		void main() {\n\
			vec2 uv = vec2( v_coord.x, v_coord.y );\n\
			vec3 dir = vec3( uv - vec2(0.5), 0.5 );\n\
			dir = u_rotation * dir;\n\
			vec2 panoramic_uv = getPanoramicUVs( dir );\n\
			vec4 color = texture2D(u_color_texture, panoramic_uv);\n\
			gl_FragColor = color;\n\
		}\n\
	';

	/* 
		Private library methods
	*/
	function parseSignature( buffer, offset ) {

		var uintBuffer = new Uint8Array( buffer );
		var endOffset = 4;

		return window.TextDecoder !== undefined ? new TextDecoder().decode(new Uint8Array( buffer ).slice( offset, offset + endOffset )) : "";
	}

	function parseString( buffer, offset ) {

		var uintBuffer = new Uint8Array( buffer );
		var endOffset = 0;

		while ( uintBuffer[ offset + endOffset ] != 0 ) 
			endOffset += 1;

		return window.TextDecoder !== undefined ? new TextDecoder().decode(new Uint8Array( buffer ).slice( offset, offset + endOffset )) : "";
	}

	function parseFloat32( buffer, offset, LE ) {
	
		var Float32 = new DataView( buffer.slice( offset, offset + 4 ) ).getFloat32( 0, LE );
		return Float32;
	}

	function parseUint16( buffer, offset, LE ) {
	
		var Uint16 = new DataView( buffer.slice( offset, offset + 2 ) ).getUint16( 0, LE );
		return Uint16;
	}
	
	function parseFaces( size, width, height, pixelData )
    {
        var faces = [],
            it = 0,
            F = HDRE.CUBE_MAP_NEGATIVE_Y;
    
        for(var i = 0; i < 6; i++)
            faces[i] = new Float32Array(size);
    
        // get 3 vertical faces
        for(var i = 0; i < height; i++)
        {
            var x1_n = (width * 0.25) + (i * width),
                    x2_n = (width * 0.5) + (i * width);
    
            if( i === (height / 3) ) { F = HDRE.CUBE_MAP_POSITIVE_Z; it = 0; }
            if( i === (height / 3) * 2 ) { F = HDRE.CUBE_MAP_POSITIVE_Y; it = 0; }
    
            var line = pixelData.subarray(x1_n * 3, x2_n * 3);
            faces[F].set(line, it);
            it += line.length;
        }
    
        // from now get the rest from left to right
    
        it = 0;
        F = HDRE.CUBE_MAP_NEGATIVE_X; // next face
        for(var i = (height / 3); i < (height / 3) * 2; i++)
        {
            var x1_n = (width * 0.0) + (i * width),
                    x2_n = (width * 0.25) + (i * width);
    
            var line = pixelData.subarray(x1_n * 3, x2_n * 3);
            faces[F].set(line, it);
            it += line.length;
        }
    
        it = 0;
        F = HDRE.CUBE_MAP_POSITIVE_X; // next face
        for(var i = (height / 3); i < (height / 3) * 2; i++)
        {
                var x1_n = (width * 0.5) + (i * width),
                        x2_n = (width * 0.75) + (i * width);
    
                var line = pixelData.subarray(x1_n * 3, x2_n * 3);
                faces[F].set(line, it);
                it += line.length;
        }
    
        it = 0;
        F = HDRE.CUBE_MAP_NEGATIVE_Z; // next face
        for(var i = (height / 3); i < (height / 3) * 2; i++)
        {
                var x1_n = (width * 0.75) + (i * width),
                        x2_n = (width * 1.0) + (i * width);
    
                var line = pixelData.subarray(x1_n * 3, x2_n * 3);
                faces[F].set(line, it);
                it += line.length;
        }

        // order faces
        var ret = [];

        ret.push( faces[HDRE.CUBE_MAP_POSITIVE_X],
                faces[HDRE.CUBE_MAP_POSITIVE_Y],
                faces[HDRE.CUBE_MAP_POSITIVE_Z],
                faces[HDRE.CUBE_MAP_NEGATIVE_X],
                faces[HDRE.CUBE_MAP_NEGATIVE_Y],
                faces[HDRE.CUBE_MAP_NEGATIVE_Z] );

        return ret;
    }
	
//footer
})( typeof(window) != "undefined" ? window : (typeof(self) != "undefined" ? self : global ) );
	
