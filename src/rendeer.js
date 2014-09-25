//Rendeer.js lightweight scene container by Javi Agenjo (javi.agenjo@gmail.com) 2014

//main namespace
(function(global){

var RD = global.RD = {};

var last_object_id = 0;


/* Temporary containers ************/
var temp_mat4 = mat4.create();
var temp_vec2 = vec3.create();
var temp_vec3 = vec3.create();
var temp_vec4 = vec3.create();
var temp_quat = quat.create();

//Scene Node
function SceneNode()
{
	this._ctor();
}

global.SceneNode = RD.SceneNode = SceneNode;

SceneNode.prototype._ctor = function()
{
	this._uid = last_object_id++;

	this._position = vec3.create();
	this._rotation = quat.create();
	this._scale = vec3.fromValues(1,1,1);
	this._local_matrix = mat4.create();
	this._global_matrix = mat4.create(); //in global space
	this._must_update_matrix = false;

	//could be used for many things
	this._color = vec4.fromValues(1,1,1,1);
	
	this.flags = {};
	
	//object inside this object
	this.children = [];
}

Object.defineProperty(SceneNode.prototype, 'position', {
	get: function() { return this._position; },
	set: function(v) { this._position.set(v); this._must_update_matrix = true; },
	enumerable: true
});

Object.defineProperty(SceneNode.prototype, 'positionX', {
	get: function() { return this._position[0]; },
	set: function(v) { this._position[0] = v; this._must_update_matrix = true; },
	enumerable: true 
});
Object.defineProperty(SceneNode.prototype, 'positionY', {
	get: function() { return this._position[1]; },
	set: function(v) { this._position[1] = v; this._must_update_matrix = true; },
	enumerable: true
});
Object.defineProperty(SceneNode.prototype, 'positionZ', {
	get: function() { return this._position[2]; },
	set: function(v) { this._position[2] = v; this._must_update_matrix = true; },
	enumerable: true 
});

Object.defineProperty(SceneNode.prototype, 'rotation', {
	get: function() { return this._rotation; },
	set: function(v) { this._rotation.set(v); this._must_update_matrix = true; },
	enumerable: true //avoid problems
});

Object.defineProperty(SceneNode.prototype, 'color', {
	get: function() { return this._color; },
	set: function(v) { this._color.set(v); },
	enumerable: true //avoid problems
});

Object.defineProperty(SceneNode.prototype, 'opacity', {
	get: function() { return this._color[3]; },
	set: function(v) { this._color[3] = v; },
	enumerable: true //avoid problems
});


/* disabled because the property and the action sound the same
Object.defineProperty(SceneNode.prototype, 'scale', {
	get: function() { return this._scale; },
	set: function(v) { 
		this._scale.set(v); 
		this._must_update_matrix = true; 
	},
	enumerable: false //avoid problems
});
*/

Object.defineProperty(SceneNode.prototype, 'parentNode', {
	get: function() { return this._parent; },
	set: function(v) { throw("Cannot set parentNode of GameObject"); },
	enumerable: false //avoid problems
});

SceneNode.prototype.addChild = function(node)
{
	if(node._parent)
		throw("addChild: Cannot add a child with a parent, remove from parent first");

	node._parent = this;

	this.children.push(node);
	change_scene(node, this._scene);

	//recursive change all children
	function change_scene(node, scene)
	{
		node._scene = scene;
		for(var i in node.children)
			change_scene( node.children[i], scene );
	}
}

SceneNode.prototype.removeChild = function(node)
{
	if(node._parent != this)
		throw("removeChild: Not its children");


	var pos = this.children.indexOf(node);
	if(pos == -1)
		throw("removeChild: impossible, should be children");

	this.children.splice(pos,1);
	node._parent = null;
	change_scene(node);

	//recursive change all children
	function change_scene(node)
	{
		node._scene = null;
		for(var i in node.children)
			change_scene( node.children[i] );
	}
}

//recursively retrieves all children nodes
SceneNode.prototype.getAllChildren = function(r)
{
	r = r || [];

	for(var i in this.children)
	{
		var node = this.children[i];
		r.push(node);
		node.getAllChildren(r);
	}

	return r;
}


SceneNode.prototype.serialize = function()
{
	var r = {
		position: [ this._position[0],this._position[1],this._position[2] ],
		rotation: [ this._rotation[0],this._rotation[1],this._rotation[2],this._rotation[3] ],
		scale: [ this._scale[0],this._scale[1],this._scale[2] ],
		children: []
	};

	for(var i in this.children)
	{
		var node = this.children[i];
		r.children.push( node.serialize() );
	}

	return r;
}

SceneNode.prototype.configure = function(o)
{
	//transform
	if(o.position) vec3.copy( this._position, o.position );
	if(o.rotation && o.rotation.length == 4) quat.copy( this._rotation, o.rotation );
	if(o.scale) vec3.copy( this._scale, o.scale );
	this.updateGlobalMatrix();

	//children
	//...
}

//transforming
SceneNode.prototype.translate = function(v)
{
	vec3.add( this._position, this._position, v );
	this._must_update_matrix = true;
}

SceneNode.prototype.rotate = function(angle_in_rad, axis)
{
	quat.setAxisAngle( temp_quat, axis, angle_in_rad );
	quat.multiply( this._rotation, this._rotation, temp_quat );
	this._must_update_matrix = true;
}

SceneNode.prototype.scale = function(v)
{
	vec3.mul( this._scale, this._scale, v );
	this._must_update_matrix = true;
}

SceneNode.prototype.getLocalMatrix = function()
{
	if(this._must_update_matrix)
		this.updateLocalMatrix();
	return this._local_matrix;
}

SceneNode.prototype.getGlobalMatrix = function()
{
	this.updateGlobalMatrix();
	return this._global_matrix;
}

SceneNode.prototype.getGlobalRotation = function(result)
{
	result = result || vec3.create();
	quat.identity(result);
	var current = this;
	//while we havent reach the tree root
	while(current != this._scene._root)
	{
		quat.multiply( result, current._rotation, result );
		current = current._parent;
	}

	return result;
}

SceneNode.prototype.updateLocalMatrix = function()
{
	var m = this._local_matrix;

	//clear
	mat4.identity( m );

	//translate
	mat4.translate( m, m, this._position );

	//rotate
	mat4.fromQuat( temp_mat4, this._rotation );
	mat4.multiply( m, m, temp_mat4 );

	//scale
	mat4.scale( m, m, this._scale );

	this._must_update_matrix = false;
}

//fast skips recomputation of parent, use it only if you are sure its already updated
SceneNode.prototype.updateGlobalMatrix = function(fast)
{
	var global = null;
	if(this._must_update_matrix)
		this.updateLocalMatrix();

	if(this._parent && this._scene && this._parent != this._scene._root)
	{
		global = fast ? this._parent._global_matrix : this._parent.getGlobalMatrix();
		mat4.multiply( this._global_matrix, global, this._local_matrix );
	}
	else
		this._global_matrix.set( this._local_matrix );
}

SceneNode.prototype.updateMatrices = function(fast)
{
	this.updateLocalMatrix();
	this.updateGlobalMatrix(fast);
}


SceneNode.prototype.fromMatrix = function(m, is_global)
{
	if(is_global && this._parent)
	{
		mat4.copy(this._global_matrix, m); //assign to global
		var M_parent = this._parent.getGlobalMatrix(); //get parent transform
		mat4.invert(M_parent,M_parent); //invert
		m = mat4.multiply( this._local_matrix, M_parent, m ); //transform from global to local
	}

	//pos
	var M = mat4.clone(m);
	mat4.multiplyVec3(this._position, M, [0,0,0]);

	//scale
	var tmp = vec3.create();
	this._scale[0] = vec3.length( mat4.rotateVec3(tmp,M,[1,0,0]) );
	this._scale[1] = vec3.length( mat4.rotateVec3(tmp,M,[0,1,0]) );
	this._scale[2] = vec3.length( mat4.rotateVec3(tmp,M,[0,0,1]) );

	mat4.scale( mat4.create(), M, [1/this._scale[0],1/this._scale[1],1/this._scale[2]] );

	//rot
	//quat.fromMat4(this._rotation, M);
	//*
	vec3.normalize( M.subarray(0,3), M.subarray(0,3) );
	vec3.normalize( M.subarray(4,7), M.subarray(4,7) );
	vec3.normalize( M.subarray(8,11), M.subarray(8,11) );
	var M3 = mat3.fromMat4( mat3.create(), M);
	mat3.transpose(M3, M3);
	quat.fromMat3(this._rotation, M3);
	quat.normalize(this._rotation, this._rotation);
	//*/

	if(m != this._local_matrix)
		mat4.copy(this._local_matrix, m);

	this._must_update_matrix = false;
}


SceneNode.prototype.getLocalPoint = function(v, result)
{
	result = result || vec3.create();
	if(this._must_update_matrix)
		this.updateLocalMatrix();
	return vec3.transformMat4(result, v, this._local_matrix );	
}

SceneNode.prototype.getLocalVector = function(v, result)
{
	result = result || vec3.create();
	return vec3.transformQuat( result, v, this._rotation );
}


SceneNode.prototype.getGlobalPoint = function(v, result)
{
	result = result || vec3.create();
	var m = this.getGlobalMatrix();
	return vec3.transformMat4(result, result, m );	
}

SceneNode.prototype.getGlobalVector = function(v, result)
{
	result = result || vec3.create();
	var quat = this.getGlobalRotation(temp_quat);
	return vec3.transformQuat( result, v, quat );
}

//recursive search
SceneNode.prototype.findNode = function(id)
{
	for(var i in this.children)
	{
		var node = this.children[i];
		if( node.id == id )
			return node[i];
		var r = node.findNode(id);
		if(r) return r;
	}
	return null;
}

//call methods inside
SceneNode.prototype.propagate = function(method, params)
{
	for(var i in this.children)
	{
		var node = this.children[i];
		if(node[method])
			node[method].apply(node, params);
		node.propagate(method, params);
	}
}





//* Scene container 

function Scene()
{
	this._root = new SceneNode();
	this._root._scene = this;
}

global.Scene = RD.Scene = Scene;

Scene.prototype.clear = function()
{
	this._root = new SceneNode();
	this._root._scene = this;
}

Scene.prototype.getNodeById = function(id)
{
	return this._root.findNode(id);
}

Scene.prototype.update = function(dt)
{
	this.root.propagate("update",[dt]);
}


Object.defineProperty(Scene.prototype, 'root', {
	get: function() { return this._root; },
	set: function(v) { throw("Cannot set root of scene"); },
	enumerable: false //avoid problems
});

/* Basic Scene Renderer *************/

function Renderer(context) {
	
	var gl = this.gl = this.context = context;
	
	this.point_size = 5;
	
	this._view_matrix = mat4.create();
	this._projection_matrix = mat4.create();
	this._viewprojection_matrix = mat4.create();
	this._mvp_matrix = mat4.create();
	this._model_matrix = mat4.create();
	
	this._nodes = [];
	this._uniforms = {
		u_view: this._view_matrix,
		u_viewprojection: this._viewprojection_matrix,
		u_model: this._model_matrix,
		u_mvp: this._mvp_matrix
	};
	
	//set some default stuff
	global.gl = this.gl;
	
	//global containers and basic data
	gl.meshes = {};
	gl.meshes["plane"] = GL.Mesh.plane({size:1});
	gl.meshes["planeXZ"] = GL.Mesh.plane({size:1,xz:true});
	gl.meshes["cube"] = GL.Mesh.cube({size:1});
	
	gl.textures = {};
	gl.textures["notfound"] = this.default_texture = new GL.Texture(1,1,{ filter: gl.NEAREST, pixel_data: new Uint8Array([0,0,0,255]) });
	gl.textures["white"] = this.default_texture = new GL.Texture(1,1,{ filter: gl.NEAREST, pixel_data: new Uint8Array([255,255,255,255]) });
	
	gl.shaders = {};
	this.createShaders();
	
}

global.Renderer = RD.Renderer = Renderer;

Renderer.prototype.render = function(scene, camera, nodes)
{
	if (!scene || !camera)
		throw("Renderer.render: not enough parameters");

	this._camera = camera;	
	camera.updateMatrices(); //multiply
	camera.extractPlanes(); //for frustrum culling
	
	this._view_matrix.set(camera._view_matrix);
	this._projection_matrix.set(camera._projection_matrix);
	this._viewprojection_matrix.set(camera._viewprojection_matrix);
	this._uniforms.u_camera_position = camera.position;

	this._nodes.length = 0;
	if(!nodes)
		scene.root.getAllChildren( this._nodes );
	nodes = nodes || this._nodes;

	//pre rendering
	if(scene.root.preRender)
		scene.root.preRender(this,camera);
	for (var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		
		//recompute matrices
		node.updateGlobalMatrix(true);
		
		if(node.preRender)
			node.preRender(this,camera);
	}
	
	//rendering	
	for (var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		if(node.flags.visible === false)
			continue;
		
		this._model_matrix.set( node._global_matrix );
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, this._model_matrix );
		
		if(node.render)
			node.render(this, camera);
		else
			this.renderNode(node, camera);
	}
	
	//post rendering
	if(scene.root.postRender)
		scene.root.postRender(this,camera);
	for (var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		if(node.postRender)
			node.postRender(this,camera);
	}
}

Renderer.prototype.renderNode = function(node, camera)
{
	//get mesh
	var mesh = null;
	if (node._mesh) //hardcoded mesh
		mesh = node._mesh;
	else if (node.mesh) //shared mesh
		mesh = gl.meshes[node.mesh];
		
	if(!mesh)
		return;
	
	if (!node._uniforms)
		node._uniforms = { u_color: node._color, u_texture: 0 };
		
	var texture = null;
	if(node._texture)
		texture = node._texture;
	else if(node.texture)
		texture = gl.textures[ node.texture ];
	if(texture)
		texture.bind(0);
	
	var shader = null;
	if (node.shader)
		shader = gl.shaders[ node.shader ];
	if (!shader)
		shader = texture ? this._texture_shader : this._flat_shader;
		
	//flags
	gl.frontFace( node.flags.flip_normals ? gl.CW : gl.CCW );
	gl[ node.flags.depth_test === false ? "disable" : "enable"]( gl.DEPTH_TEST );
	if( node.flags.depth_write === false )
		gl.depthMask( false );
	gl[ node.flags.two_sided === true ? "disable" : "enable"]( gl.CULL_FACE );
	
	//blend
	if(node.flags.blend)
	{
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, node.blendMode == "additive" ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA );
	}
	
	if(node.onRender)
		node.onRender(this, camera, shader);
	
	shader.uniforms( this._uniforms );
	shader.uniforms( node._uniforms );
	shader.draw( mesh, node.primitive === undefined ? gl.TRIANGLES : node.primitive);

	if( node.flags.flip_normals ) gl.frontFace( gl.CCW );
	if( node.flags.depth_test === false ) gl.enable( gl.DEPTH_TEST );
	if( node.flags.blend ) gl.disable( gl.BLEND );
	if( node.flags.two_sided ) gl.disable( gl.CULL_FACE );
	if( node.flags.depth_write === false )
		gl.depthMask( true );
}

Renderer.prototype.setPointSize = function(v)
{
	this.point_size = v;
	gl.shaders["point"].uniforms({u_pointSize: this.point_size});
}


global.Renderer = Renderer;


//Camera ************************************
function Camera( options )
{
	this.type = Camera.PERSPECTIVE;

	this._position = vec3.fromValues(0,100, 100);
	this._target = vec3.fromValues(0,0,0);
	this._up = vec3.fromValues(0,1,0);
	
	this.near = 0.1;
	this.far = 10000;
	this.aspect = 1.0;
	this.fov = 45; //persp
	this.frustum_size = 50; //ortho

	this._view_matrix = mat4.create();
	this._projection_matrix = mat4.create();
	this._viewprojection_matrix = mat4.create();
	this._model_matrix = mat4.create(); //inverse of view
	
	this._must_update_matrix = false;

	this._top = vec3.create();
	this._right = vec3.create();
	this._front = vec3.create();
	
	if(options)
	{
		if(options.position) this._position.set(options.position);
		if(options.target) this._target.set(options.target);
		if(options.up) this._up.set(options.up);
		if(options.near) this.near = options.near;
		if(options.far) this.far = options.far;
		if(options.fov) this.fov = options.fov;
		if(options.aspect) this.aspect = options.aspect;
	}
	

	this.updateMatrices();
}

global.Camera = RD.Camera = Camera;

Camera.PERSPECTIVE = 1;
Camera.ORTHOGRAPHIC = 2;


Object.defineProperty(Camera.prototype, 'position', {
	get: function() { return this._position; },
	set: function(v) { this._position.set(v); this._must_update_matrix = true; },
	enumerable: false //avoid problems
});

Object.defineProperty(Camera.prototype, 'target', {
	get: function() { return this._target; },
	set: function(v) { this._target.set(v); this._must_update_matrix = true; },
	enumerable: false //avoid problems
});


Object.defineProperty(Camera.prototype, 'up', {
	get: function() { return this._up; },
	set: function(v) { this._up.set(v); this._must_update_matrix = true; },
	enumerable: false //avoid problems
});

Camera.prototype.perspective = function(fov, aspect, near, far)
{
	this.type = Camera.PERSPECTIVE;
	this.fov = fov;
	this.aspect = aspect;
	this.near = near;
	this.far = far;
	
	this._must_update_matrix = true;
}

Camera.prototype.ortho = function(frustum_size)
{
	this.type = Camera.ORTHOGRAPHIC;
	this.frustum_size = frustum_size;
}

Camera.prototype.lookAt = function(position,target,up)
{
	vec3.copy(this._position, position);
	vec3.copy(this._target, target);
	vec3.copy(this._up, up);
	
	this._must_update_matrix = true;
}

Camera.prototype.updateMatrices = function()
{
	if(this.type == Camera.ORTHOGRAPHIC)
		mat4.ortho(this._projection_matrix, -this.frustum_size*this.aspect, this.frustum_size*this.aspect, -this.frustum_size, this.frustum_size, this.near, this.far);
	else
		mat4.perspective(this._projection_matrix, this.fov * DEG2RAD, this.aspect, this.near, this.far);
	mat4.lookAt(this._view_matrix, this._position, this._target, this._up);
	mat4.multiply(this._viewprojection_matrix, this._projection_matrix, this._view_matrix );
	mat4.invert(this._model_matrix, this._view_matrix );
	
	this._must_update_matrix = false;

	mat4.rotateVec3( this._right, this._model_matrix, [1,0,0] );
	mat4.rotateVec3( this._top,   this._model_matrix, [0,1,0] );
	mat4.rotateVec3( this._front, this._model_matrix, [0,0,1] );

	this.distance = vec3.distance(this._position, this._target);
}

Camera.prototype.getModel = function(m)
{
	m = m || mat4.create();
	mat4.invert(this._model_matrix, this._view_matrix );
	mat4.copy(m, this._model_matrix);
	return m;
}

Camera.prototype.updateVectors = function(model)
{
	var front = vec3.subtract( temp_vec3, this._target, this._position);
	var dist = vec3.length(front);
	mat4.multiplyVec3(this._position, model, [0,0,0]);
	mat4.multiplyVec3(this._target, model, [0,0,-dist]);
	mat4.rotateVec3(this._up, model, [0,1,0]);
}

Camera.prototype.getLocalVector = function(v, result)
{
	if(this._must_update_matrix)
		this.updateMatrices();
		
	return mat4.rotateVec3( result || vec3.create(), this._model_matrix, v );
}

Camera.prototype.getLocalPoint = function(v, result)
{
	if(this._must_update_matrix)
		this.updateMatrices();
	
	return vec3.transformMat4( result || vec3.create(), v, this._model_matrix );
}

Camera.prototype.getFront = function(dest)
{
	dest = dest || vec3.create();
	vec3.subtract(dest, this._target, this._position);
	vec3.normalize(dest, dest);
	return dest;
}

Camera.prototype.move = function(v)
{
	vec3.add(this._target, this._target, v);
	vec3.add(this._position, this._position, v);
	this._must_update_matrix = true;
}

Camera.prototype.moveLocal = function(v)
{
	var delta = mat4.rotateVec3(temp_vec3, this.model_matrix, v);
	vec3.add(this._target, this._target, delta);
	vec3.add(this._position, this._position, delta);
	this._must_update_matrix = true;
}

Camera.prototype.rotate = function(angle_in_deg, axis)
{
	var R = quat.setAxisAngle( temp_quat, axis, angle_in_deg * DEG2RAD );
	var front = vec3.subtract( temp_vec3, this._target, this._position );
	vec3.transformQuat(front, front, R );
	vec3.add(this._target, this._position, front);
	this._must_update_matrix = true;
}

Camera.prototype.orbit = function(angle_in_deg, axis, center)
{
	center = center || this._target;
	var R = quat.setAxisAngle( temp_quat, axis, angle_in_deg * DEG2RAD );
	var front = vec3.subtract( temp_vec3, this._position, this._target );
	vec3.transformQuat(front, front, R );
	vec3.add(this._position, center, front);
	this._must_update_matrix = true;
}

Camera.prototype.orbitDistanceFactor = function(f, center)
{
	center = center || this._target;
	var front = vec3.subtract( temp_vec3, this._position, center);
	vec3.scale(front, front,f);
	vec3.add(this._position, center, front);
	this._must_update_matrix = true;
}

//from 3D to 2D
Camera.prototype.project = function( vec, viewport )
{
	viewport = viewport || [0,0,gl.canvas.width, gl.canvas.height];
	var result = mat4.multiplyVec3( temp_vec3, this._viewprojection_matrix, vec );
	result[0] /= result[2];
	result[1] /= result[2];
	return vec3.fromValues( (result[0]+1) * (viewport[2]*0.5) + viewport[0], (result[1]+1) * (viewport[3]*0.5) + viewport[1], result[2] );
}

//from 2D to 3D
Camera.prototype.unproject = function( vec, viewport )
{
	viewport = viewport || [0,0,gl.canvas.width, gl.canvas.height];
	return vec3.unproject(vec3.create(), vec, this._view_matrix, this._projection_matrix, viewport );
}

Camera.prototype.getRayPlaneCollision = function(x,y, position, normal, result)
{
	var RT = new GL.Raytracer(this._view_matrix, this._projection_matrix);
	var start = this._position;
	var dir = RT.getRayForPixel( x,y );
	result = result || vec3.create();
	if( geo.testRayPlane( start, dir, position, normal, result ) )
		return result;
	return null;
}

Camera.prototype.extractPlanes = function()
{
	var vp = this._viewprojection_matrix;
	var planes = this._planes || new Float32Array(4*6);

	//right
	planes.set( [vp[3] - vp[0], vp[7] - vp[4], vp[11] - vp[8], vp[15] - vp[12] ], 0); 
	normalize(0);

	//left
	planes.set( [vp[3] + vp[0], vp[ 7] + vp[ 4], vp[11] + vp[ 8], vp[15] + vp[12] ], 4);
	normalize(4);

	//bottom
	planes.set( [ vp[ 3] + vp[ 1], vp[ 7] + vp[ 5], vp[11] + vp[ 9], vp[15] + vp[13] ], 8);
	normalize(8);

	//top
	planes.set( [ vp[ 3] - vp[ 1], vp[ 7] - vp[ 5], vp[11] - vp[ 9], vp[15] - vp[13] ],12);
	normalize(12);

	//back
	planes.set( [ vp[ 3] - vp[ 2], vp[ 7] - vp[ 6], vp[11] - vp[10], vp[15] - vp[14] ],16);
	normalize(16);

	//front
	planes.set( [ vp[ 3] + vp[ 2], vp[ 7] + vp[ 6], vp[11] + vp[10], vp[15] + vp[14] ],20);
	normalize(20);

	this._planes = planes;

	function normalize(pos)
	{
		var N = planes.subarray(pos,pos+3);
		var l = vec3.length(N);
		if(l) return;
		l = 1.0 / l;
		planes[pos] *= l;
		planes[pos+1] *= l;
		planes[pos+2] *= l;
		planes[pos+3] *= l;
	}
}

var CLIP_INSIDE = 0;
var CLIP_OUTSIDE = 1;
var CLIP_OVERLAP = 2;

//box in {center:vec3,halfsize:vec3} format
Camera.prototype.testBox = function(box)
{
	if(!this._planes) this.extractPlanes();
	var planes = this._planes;

	var flag = 0, o = 0;

	flag = planeOverlap(planes.subarray(0,4),box);
	if (flag == CLIP_OUTSIDE) return CLIP_OUTSIDE; o+= flag;
	flag =  planeOverlap(planes.subarray(4,8),box);
	if (flag == CLIP_OUTSIDE) return CLIP_OUTSIDE; o+= flag;
	flag =  planeOverlap(planes.subarray(8,12),box);
	if (flag == CLIP_OUTSIDE) return CLIP_OUTSIDE; o+= flag;
	flag =  planeOverlap(planes.subarray(12,16),box);
	if (flag == CLIP_OUTSIDE) return CLIP_OUTSIDE; o+= flag;
	flag =  planeOverlap(planes.subarray(16,20),box);
	if (flag == CLIP_OUTSIDE) return CLIP_OUTSIDE; o+= flag;
	flag =  planeOverlap(planes.subarray(20,24),box);
	if (flag == CLIP_OUTSIDE) return CLIP_OUTSIDE; o+= flag;

	if (o==0) return CLIP_INSIDE;
	else return CLIP_OVERLAP;
}

Camera.prototype.testSphere = function(center, radius)
{
	if(!this._planes) this.extractPlanes();
	var planes = this._planes;

	var dist;
	var overlap = false;

	dist = distanceToPlane( planes.subarray(0,4), center );
	if( dist < -radius ) return CLIP_OUTSIDE;
	else if(dist >= -radius && dist <= radius)	overlap = true;
	dist = distanceToPlane( planes.subarray(4,8), center );
	if( dist < -radius ) return CLIP_OUTSIDE;
	else if(dist >= -radius && dist <= radius)	overlap = true;
	dist = distanceToPlane( planes.subarray(8,12), center );
	if( dist < -radius ) return CLIP_OUTSIDE;
	else if(dist >= -radius && dist <= radius)	overlap = true;
	dist = distanceToPlane( planes.subarray(12,16), center );
	if( dist < -radius ) return CLIP_OUTSIDE;
	else if(dist >= -radius && dist <= radius)	overlap = true;
	dist = distanceToPlane( planes.subarray(16,20), center );
	if( dist < -radius ) return CLIP_OUTSIDE;
	else if(dist >= -radius && dist <= radius)	overlap = true;
	dist = distanceToPlane( planes.subarray(20,24), center );
	if( dist < -radius ) return CLIP_OUTSIDE;
	else if(dist >= -radius && dist <= radius)	overlap = true;
}



/* used functions */

function distanceToPlane(plane, point)
{
	return vec3.dot(plane,point) + plane[3];
}

function planeOverlap(plane, box)
{
	var n = plane.subarray(0,3);
	var d = plane[3];

	var tmp = vec3.fromValues(
		Math.abs( box.halfsize[0] * n[0]),
		Math.abs( box.halfsize[1] * n[1]),
		Math.abs( box.halfsize[2] * n[2])
	);

	var radius = tmp[0]+tmp[1]+tmp[2];
	var distance = vec3.dot(n,box.center) + d;

	if (distance <= - radius) return CLIP_OUTSIDE;
	else if (distance <= radius) return CLIP_OVERLAP;
	else return CLIP_INSIDE;
}

Renderer.prototype.createShaders = function()
{
	this._flat_shader = new GL.Shader('\
				precision highp float;\
				attribute vec3 a_vertex;\
				uniform mat4 u_mvp;\
				void main() {\
					gl_Position = u_mvp * vec4(a_vertex,1.0);\
					gl_PointSize = 5.0;\
				}\
				', '\
				precision highp float;\
				uniform vec4 u_color;\
				void main() {\
				  gl_FragColor = u_color;\
				}\
			');
	gl.shaders["flat"] = this._flat_shader;
	
	this._point_shader = new GL.Shader('\
				precision highp float;\
				attribute vec3 a_vertex;\
				uniform mat4 u_mvp;\
				uniform float u_pointSize;\
				void main() {\
					gl_PointSize = u_pointSize;\
					gl_Position = u_mvp * vec4(a_vertex,1.0);\
				}\
				', '\
				precision highp float;\
				uniform vec4 u_color;\
				void main() {\
				  if( distance( gl_PointCoord, vec2(0.5)) > 0.5)\
				     discard;\
				  gl_FragColor = u_color;\
				}\
			');
	gl.shaders["point"] = this._point_shader;	
	
	this._color_shader = new GL.Shader('\
		precision highp float;\
		attribute vec3 a_vertex;\
		attribute vec4 a_color;\
		varying vec4 v_color;\
		uniform vec4 u_color;\
		uniform mat4 u_mvp;\
		uniform mat4 u_modelt;\
		void main() {\
			v_color = a_color * u_color;\
			gl_Position = u_mvp * vec4(a_vertex,1.0);\
			gl_PointSize = 5.0;\
		}\
		', '\
		precision highp float;\
		varying vec4 v_color;\
		void main() {\
		  gl_FragColor = v_color;\
		}\
	');
	gl.shaders["color"] = this._color_shader;
	
	this._texture_shader = new GL.Shader('\
		precision highp float;\
		attribute vec3 a_vertex;\
		attribute vec2 a_coord;\
		varying vec2 v_coord;\
		uniform mat4 u_mvp;\
		uniform mat4 u_modelt;\
		void main() {\
			v_coord = a_coord;\
			gl_Position = u_mvp * vec4(a_vertex,1.0);\
			gl_PointSize = 5.0;\
		}\
		', '\
		precision highp float;\
		varying vec2 v_coord;\
		uniform vec4 u_color;\
		uniform sampler2D u_texture;\
		void main() {\
			gl_FragColor = u_color * texture2D(u_texture, v_coord);\
		}\
	');
	gl.shaders["texture"] = this._flat_shader;	
	
	
	//basic phong shader
	this._phong_shader = new GL.Shader('\
			precision highp float;\
			attribute vec3 a_vertex;\
			attribute vec3 a_normal;\
			varying vec3 v_normal;\
			uniform mat4 u_mvp;\
			uniform mat4 u_model;\
			void main() {\
				v_normal = (u_model * vec4(a_normal,0.0)).xyz;\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\
			}\
			', '\
			precision highp float;\
			varying vec3 v_normal;\
			uniform vec3 u_lightvector;\
			uniform vec4 u_color;\
			void main() {\
			  vec3 N = normalize(v_normal);\
			  gl_FragColor = u_color * max(0.0, dot(u_lightvector,N));\
			}\
		');
	gl.shaders["phong"] = this._phong_shader;

	//basic phong shader
	this._phong_shader = new GL.Shader('\
			precision highp float;\
			attribute vec3 a_vertex;\
			attribute vec3 a_normal;\
			attribute vec2 a_coord;\
			varying vec2 v_coord;\
			varying vec3 v_normal;\
			uniform mat4 u_mvp;\
			uniform mat4 u_model;\
			void main() {\n\
				v_coord = a_coord;\n\
				v_normal = (u_model * vec4(a_normal,0.0)).xyz;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			', '\
			precision highp float;\
			varying vec3 v_normal;\
			varying vec2 v_coord;\
			uniform vec3 u_lightvector;\
			uniform vec4 u_color;\
			uniform sampler2D u_texture;\
			void main() {\
			  vec3 N = normalize(v_normal);\
			  gl_FragColor = u_color * texture2D(u_texture, v_coord) * max(0.0, dot(u_lightvector,N));\
			}\
		');
	gl.shaders["textured_phong"] = this._phong_shader;
}


//footer

})(window);