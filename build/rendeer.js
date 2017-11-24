//packer version
//packer version
//Rendeer.js lightweight scene container by Javi Agenjo (javi.agenjo@gmail.com) 2014

//main namespace
(function(global){

/**
 * Main namespace
 * @namespace RD
 */

/**
 * the global namespace, access it using RD.
 * @class .
 */

/**
* @property ZERO {vec3}
* @default[0,0,0]
*/

/**
* @property ONE {vec3}
* @default[1,1,1]
*/

/**
* @property BLACK {vec3}
* @default[0,0,0]
*/

/**
* @property WHITE {vec3}
* @default[1,1,1]
*/

var RD = global.RD = {
	version: 0.5
};

RD.ZERO = vec3.fromValues(0,0,0);
RD.ONE = vec3.fromValues(1,1,1);
RD.RIGHT = vec3.fromValues(1,0,0);
RD.LEFT = vec3.fromValues(-1,0,0);
RD.UP = vec3.fromValues(0,1,0);
RD.DOWN = vec3.fromValues(0,-1,0);
RD.FRONT = vec3.fromValues(0,0,-1);
RD.BACK = vec3.fromValues(0,0,1);
RD.FRONT2D = vec2.fromValues(0,1);
RD.WHITE = vec3.fromValues(1,1,1);
RD.BLACK = vec3.fromValues(0,0,0);
RD.IDENTITY = mat4.create();

//higher means render before
RD.PRIORITY_BACKGROUND = 30;
RD.PRIORITY_OPAQUE = 20;
RD.PRIORITY_ALPHA = 10;
RD.PRIORITY_HUD = 0;

RD.BLEND_NONE = 0;
RD.BLEND_ALPHA = 1; //src_alpha, one_minus_src_alpha
RD.BLEND_ADD = 2; //src_alpha, one
RD.BLEND_MULTIPLY = 3; //GL.DST_COLOR, GL.ONE_MINUS_SRC_ALPHA

RD.setup = function(o)
{
	o = o || {};
	if(RD.configuration)
		throw("already called setup");
	RD.configuration = o;
}

var last_object_id = 0;


/* Temporary containers ************/
var identity_mat4 = mat4.create();
var temp_mat3 = mat3.create();
var temp_mat4 = mat4.create();
var temp_vec2 = vec2.create();
var temp_vec3 = vec3.create();
var temp_vec3b = vec3.create();
var temp_vec4 = vec4.create();
var temp_quat = quat.create();


/**
* SceneNode class to hold an scene item
* @class SceneNode
* @constructor
*/
function SceneNode( o )
{
	if(this.constructor !== RD.SceneNode)
		throw("You must use new to create RD.SceneNode");
	this._ctor();
	if(o)
		this.configure( o );
}

RD.SceneNode = SceneNode;

SceneNode.prototype._ctor = function()
{
	this._uid = last_object_id++;
	this._id = null;

	//transform info
	this._position = vec3.create();
	this._rotation = quat.create();
	this._scale = vec3.fromValues(1,1,1);
	this._local_matrix = mat4.create();
	this._global_matrix = mat4.create(); //in global space
	this._must_update_matrix = false;

	//watchers
	//TO DO: use Proxy

	//bounding
	this._bounding_box = null; //use updateBoundingBox to update it

	//rendering priority (order)
	this.render_priority = RD.PRIORITY_OPAQUE;

	//could be used for many things
	this.blend_mode = RD.BLEND_NONE;
	this.layers = 0x3; //first two layers
	this._color = vec4.fromValues(1,1,1,1);
	this._uniforms = { u_color: this._color, u_color_texture: 0 };
	this.primitive = GL.TRIANGLES;
	this.draw_range = null;

	//overwrite callbacks
	this.onRender = null;
	this.onShaderUniforms = null;

	//assets
	this.shader = null;
	this.mesh = null;
	this.textures = {};

	this.flags = {
		visible: true,
		collides: true //for testRay
	};

	//object inside this object
	this.children = [];
}

/*
SceneNode.prototype.super = function(class_name)
{
	
}
*/

SceneNode.prototype.clone = function()
{
	var o = new this.constructor();
	for(var i in this)
	{
		if(i[0] == "_") //private
			continue;
		if(this.__lookupGetter__(i)) //its a getter
			continue;
		if(i == "children") //never copy this
			continue;
		var v = this[i];
		if(v === undefined)
			continue;
		else if(v === null)
			o[i] = null;
		else if(v.constructor === Object)
			o[i] = GL.cloneObject(v);
		else if(v.constructor === Array)
			o[i] = v.concat();
		else if(o[i] !== v)
			o[i] = v;
	}
	return o;
}


/**
* A unique identifier, useful to retrieve nodes by name
* @property id {string}
*/
Object.defineProperty(SceneNode.prototype, 'id', {
	get: function() { return this._id; },
	set: function(v) {
		if(this._scene)
			console.error("Cannot change id of a node already in a scene.");
		else
			this._id = v;
	},
	enumerable: true
});

/**
* the name of the shader in the shaders manager
* @property shader {string}
*/


/**
* The position relative to its parent
* @property uniforms {vec3}
*/
Object.defineProperty(SceneNode.prototype, 'uniforms', {
	get: function() { return this._uniforms; },
	set: function(v) { 
		GL.cloneObject(v, this._uniforms);
		this._uniforms["u_color"] = this._color;
	},
	enumerable: true 
});


/**
* The position relative to its parent in vec3 format
* @property position {vec3}
*/
Object.defineProperty(SceneNode.prototype, 'position', {
	get: function() { return this._position; },
	set: function(v) { this._position.set(v); this._must_update_matrix = true; },
	enumerable: true
});

/**
* The x position component relative to its parent
* @property x {number}
*/
Object.defineProperty(SceneNode.prototype, 'x', {
	get: function() { return this._position[0]; },
	set: function(v) { this._position[0] = v; this._must_update_matrix = true; },
	enumerable: true
});

/**
* The y position component relative to its parent
* @property y {number}
*/
Object.defineProperty(SceneNode.prototype, 'y', {
	get: function() { return this._position[1]; },
	set: function(v) { this._position[1] = v; this._must_update_matrix = true; },
	enumerable: true
});

/**
* The z position component relative to its parent
* @property z {number}
*/
Object.defineProperty(SceneNode.prototype, 'z', {
	get: function() { return this._position[2]; },
	set: function(v) { this._position[2] = v; this._must_update_matrix = true; },
	enumerable: true
});


/**
* The orientation relative to its parent in quaternion format
* @property rotation {quat}
*/

Object.defineProperty(SceneNode.prototype, 'rotation', {
	get: function() { return this._rotation; },
	set: function(v) { this._rotation.set(v); this._must_update_matrix = true; },
	enumerable: true //avoid problems
});

/**
* The scaling relative to its parent in vec3 format (default is [1,1,1])
* @property scaling {vec3}
*/
Object.defineProperty(SceneNode.prototype, 'scaling', {
	get: function() { return this._scale; },
	set: function(v) { 
		if(v.constructor === Number)
			this._scale[0] = this._scale[1] = this._scale[2] = v;
		else
			this._scale.set(v);
		this._must_update_matrix = true; },
	enumerable: true
});


Object.defineProperty(SceneNode.prototype, 'pivot', {
	get: function() { return this._pivot; },
	set: function(v) { 
		this._must_update_matrix = true; 	
		if(!v)
		{
			this._pivot = null;
			this.flags.pivot = false;
			return;
		}
		if(!this._pivot)
			this._pivot = vec3.create();
		this._pivot.set(v);
		this.flags.pivot = true;
	},
	enumerable: true
});

/**
* The color in RGBA format
* @property color {vec4}
* @default [1,1,1,1]
*/
Object.defineProperty(SceneNode.prototype, 'color', {
	get: function() { return this._color; },
	set: function(v) { this._color.set(v); },
	enumerable: true //avoid problems
});

/**
* This number is the 4º component of color but can be accessed directly 
* @property opacity {number}
*/
Object.defineProperty(SceneNode.prototype, 'opacity', {
	get: function() { return this._color[3]; },
	set: function(v) { this._color[3] = v; },
	enumerable: true //avoid problems
});

Object.defineProperty(SceneNode.prototype, 'visible', {
	get: function() { return this.flags.visible; },
	set: function(v) { this.flags.visible = v; },
	enumerable: true //avoid problems
});

/**
* This assigns the texture to the color channel ( the same as setTexture("color", tex) )
* @property texture {String}
* @default null
*/
Object.defineProperty( SceneNode.prototype, 'texture', {
	get: function() { return this.textures["color"]; },
	set: function(v) { this.textures["color"] = v; },
	enumerable: false //it will be shown in textures anyway
});

/**
* The scene where this node is attached
* @property scene {Scene}
*/
Object.defineProperty( SceneNode.prototype, 'scene', {
	get: function() { return this._scene; },
	set: function(v) { throw("cannot set scene, you must use addChild in its parent node"); },
	enumerable: false //this cannot be serialized
});


/**
* The parent node where this node is attached
* @property parentNode {SceneNode}
*/
Object.defineProperty(SceneNode.prototype, 'parentNode', {
	get: function() { return this._parent; },
	set: function(v) { throw("Cannot set parentNode of SceneNode"); },
	enumerable: false //avoid problems
});


/**
* Attach node to its children list
* @method addChild
* @param {RD.SceneNode} node
* @param {Bool} keep_transform if true the node position/rotation/scale will be modified to match the current global matrix (so it will stay at the same place)
*/
SceneNode.prototype.addChild = function( node, keep_transform )
{
	if(node._parent)
		throw("addChild: Cannot add a child with a parent, remove from parent first");

	node._parent = this;
	if( keep_transform )
		node.fromMatrix( node._global_matrix );

	this.children.push(node);
	change_scene(node, this._scene);

	//recursive change all children
	function change_scene(node, scene)
	{
		node._scene = scene;
		if(node.id && scene)
			scene._nodes_by_id[node.id] = node;
		for(var i = 0, l = node.children.length; i < l; i++)
			change_scene( node.children[i], scene );
	}
}

/**
* Remove a node from its children list
* @method removeChild
* @param {SceneNode} node
*/
SceneNode.prototype.removeChild = function( node, keep_transform )
{
	if(node._parent != this)
		throw("removeChild: Not its children");

	var pos = this.children.indexOf(node);
	if(pos == -1)
		throw("removeChild: impossible, should be children");

	this.children.splice(pos,1);
	node._parent = null;
	if( keep_transform )
		node.fromMatrix( node._global_matrix );

	change_scene(node);

	//recursive change all children
	function change_scene(node)
	{
		if(node.id && node._scene && node._scene._nodes_by_id[node.id])
			delete node._scene._nodes_by_id[ node.id ];
		
		node._scene = null;
		for(var i = 0, l = node.children.length; i < l; i++)
			change_scene( node.children[i] );
	}
}

SceneNode.prototype.removeAllChildren = function()
{
	while(this.children.length)
		this.removeChild( this.children[0] );
}

/**
* Remove all childs
* @method clear
*/
SceneNode.prototype.clear = function()
{
	while(this.children.length)
		this.removeChild( this.children[ this.children.length - 1 ] );
}

/**
* Change the order inside the children, useful when rendering without Depth Test
* @method setChildIndex
* @param {RD.SceneNode} child
* @param {Number} index
*/
SceneNode.prototype.setChildIndex = function(child, index)
{
		var old_index = this.children.indexOf(child);
		if(old_index == -1)
			return;
		this.children.splice(old_index,1);
		this.children.splice(index,0,child);
}

/**
* Recursively retrieves all children nodes (this doesnt include itself)
* @method getAllChildren
* @param {Array} result [Optional] you can specify an array where all the children will be pushed
* @return {Array} all the children nodes
*/
SceneNode.prototype.getAllChildren = function(r)
{
	r = r || [];

	for(var i = 0, l = this.children.length; i < l; i++)
	{
		var node = this.children[i];
		r.push(node);
		node.getAllChildren(r);
	}

	return r;
}

/**
* Recursively retrieves all children nodes taking into account visibility (flags.visible)
* @method getVisibleChildren
* @param {Array} [result=Array] you can specify an array where all the children will be pushed
* @return {Array} all the children nodes
*/
SceneNode.prototype.getVisibleChildren = function( result, layers )
{
	result = result || [];
	if(layers === undefined)
		layers = 0xFF;

	if(this.flags.visible === false)
		return result;

	for(var i = 0, l = this.children.length; i < l; i++)
	{
		var node = this.children[i];
		if(node.layers & layers)
			result.push(node);
		node.getVisibleChildren(result, layers);
	}

	return result;
}

/**
* Returns an object that represents the current state of this object an its children
* @method serialize
* @return {Object} object
*/
SceneNode.prototype.serialize = function()
{
	var r = {
		position: [ this._position[0], this._position[1], this._position[2] ],
		rotation: [ this._rotation[0], this._rotation[1], this._rotation[2], this._rotation[3] ],
		scale: [ this._scale[0], this._scale[1], this._scale[2] ],
		children: []
	};

	for(var i = 0, l = this.children.length; i < l; i++)
	{
		var node = this.children[i];
		r.children.push( node.serialize() );
	}

	return r;
}

/**
* Configure this SceneNode to a state from an object (used with serialize)
* @method configure
* @param {Object} o object with the state of a SceneNode
*/
SceneNode.prototype.configure = function(o)
{
	var parent = null;

	//copy to attributes
	for(var i in o)
	{
		switch( i )
		{
			case "children": //special case
				continue;
			case "uniforms": //special case
				for(var j in o.uniforms)
					this.uniforms[j] = o.uniforms[j];
				continue;
			case "texture":
				this[i] = o[i];
				continue;
			case "scale":
			case "scaling":
				this.scale(o[i]);
				continue;
			case "parent":
				parent = o[i];
				continue;
		};

		//default
		var v = this[i];
		if(v === undefined)
			continue;

		if( v && v.constructor === Float32Array )
			v.set( o[i] );
		else 
			this[i] = o[i];
	}

	this._must_update_matrix = true;

	//update matrix
	this.updateGlobalMatrix();

	if(o.children)
	{
		for(var i = 0; i < o.children.length; ++i)
			console.warn("configure children: feature not implemented");		
	}

	if(parent)
	{
		if(this.parentNode)
			console.error("This node already has a parent");
		else
			parent.addChild( this );
	}
}


/**
* sets the name of the mesh to be used to render the object
* @method setMesh
* @param {String|Mesh} mesh_name also it accepts a mesh itself
*/
SceneNode.prototype.setMesh = function( mesh_name )
{
	if(!mesh_name)
		this.mesh = null;
	else if( typeof(mesh_name) == "string" )
		this.mesh = mesh_name;
	else
		this._mesh = mesh_name;
}

/**
* Sets the name of the mesh to be used to render the object
* @method setTexture
* @param {String} channel which channel to use (the texture will be uploaded to the shader with the name "u_" + channel + "_texture"
* @param {String} texture texture name (textures are retrieved from the renderer.textures
*/
SceneNode.prototype.setTexture = function(channel, texture)
{
	if(!texture)
		this.textures[channel] = null;
	else if( typeof(texture) == "string" )
		this.textures[ channel ] = texture;
}

/**
* clears position, rotation and scale
* @method resetTransform
*/
SceneNode.prototype.resetTransform = function()
{
	this._position.set( RD.ZERO );
	quat.identity( this._rotation );
	this._scale.set( RD.ONE );
	this._must_update_matrix = true;
}

/**
* Translate object in local space
* @method translate
* @param {vec3} delta
*/
SceneNode.prototype.translate = function(delta)
{
	vec3.add( this._position, this._position, delta );
	this._must_update_matrix = true;
}

/**
* Rotate object (supports local or global but doesnt takes into account parent)
* @method rotate
* @param {number} angle_in_rad
* @param {vec3} axis
* @param {boolean} in_local specify if the axis is in local space or global space
*/
SceneNode.prototype.rotate = function(angle_in_rad, axis, in_local)
{
	quat.setAxisAngle( temp_quat, axis, angle_in_rad );
	
	if(!in_local)
		quat.multiply( this._rotation, this._rotation, temp_quat );
	else
		quat.multiply( this._rotation, temp_quat, this._rotation );
	this._must_update_matrix = true;
}

/**
* Scale object 
* @method scale
* @param {vec3} v
*/
SceneNode.prototype.scale = function(v)
{
	if(v.constructor === Number)
	{
		temp_vec3[0] = temp_vec3[1] = temp_vec3[2] = v;
		vec3.mul( this._scale, this._scale, temp_vec3 );
	}
	else
		vec3.mul( this._scale, this._scale, v );
	this._must_update_matrix = true;
}

/**
* Set the pivot point, 0,0,0 by default (WARNING: use flags.pivot = true  to enable the use of the pivot)
* @method setPivot
* @param {vec3} pivot local coordinate of the pivot point
*/
SceneNode.prototype.setPivot = function(pivot)
{
	this.pivot = pivot;
}

SceneNode.prototype.orbit = function(angle, axis, pivot)
{
	if(!axis)
		throw("RD: orbit axis missing");
	var R = quat.setAxisAngle( temp_quat, axis, angle );

	//TODO
	this._must_update_matrix = true;
}

/**
* Get transform local matrix
* @method getLocalMatrix
* @return {mat4} matrix44 
*/
SceneNode.prototype.getLocalMatrix = function()
{
	if(this._must_update_matrix)
		this.updateLocalMatrix();
	return this._local_matrix;
}

/**
* Get transform global matrix (concatenating parents) (its a reference)
* @method getGlobalMatrix
* @return {mat4} matrix44 
*/
SceneNode.prototype.getGlobalMatrix = function()
{
	this.updateGlobalMatrix();
	return this._global_matrix;
}

/**
* Get global rotation (concatenating parent rotations)
* @method getGlobalRotation
* @param {quat} [result=quat] quaternion to store the result
* @return {quat} resulting rotation in quaternion format 
*/
SceneNode.prototype.getGlobalRotation = function(result)
{
	result = result || vec3.create();
	quat.identity(result);
	var current = this;
	var top = this._scene ? this._scene._root : null;
	//while we havent reach the tree root
	while(current != top)
	{
		quat.multiply( result, current._rotation, result );
		current = current._parent;
	}

	return result;
}

/**
* recomputes _local_matrix according to position, rotation and scaling
* @method updateLocalMatrix
*/
SceneNode.prototype.updateLocalMatrix = function()
{
	var m = this._local_matrix;
	this._must_update_matrix = false;

	//clear
	mat4.identity( m );

	if( this.flags.no_transform )
		return;

	//pivoted
	if(this.flags.pivot && this._pivot)
	{
		//m[12] = -this._pivot[0]; m[13] = -this._pivot[1]; m[14] = -this._pivot[2];
		m[12] = this._pivot[0]; m[13] = this._pivot[1]; m[14] = this._pivot[2];
	}

	//translate
	mat4.translate( m, m, this._position );

	//rotate
	mat4.fromQuat( temp_mat4, this._rotation );
	mat4.multiply( m, m, temp_mat4 );

	//scale
	mat4.scale( m, m, this._scale );

	//pivoted
	if(this.flags.pivot && this._pivot)
	{
		//mat4.translate(m,m,this._pivot);
		mat4.translate(m,m,[-this._pivot[0],-this._pivot[1],-this._pivot[2]]);
	}
}

//
/**
* recomputes _global_matrix according to position, rotation and scaling
* @method updateGlobalMatrix
* @param {boolean} [fast=false] skips recomputation of parent, use it only if you are sure its already updated
* @param {boolean} [update_childs=false] update global matrix in childs too
*/
SceneNode.prototype.updateGlobalMatrix = function(fast, update_childs)
{
	var global = null;
	if( this._must_update_matrix && !this.flags.no_transform )
		this.updateLocalMatrix();

	if(this._parent && this._scene && this._parent != this._scene._root)
	{
		global = fast ? this._parent._global_matrix : this._parent.getGlobalMatrix();
		if( this.flags.no_transform )
			this._global_matrix.set( global );
		else
			mat4.multiply( this._global_matrix, global, this._local_matrix );
	}
	else //no parent
	{
		this._global_matrix.set( this._local_matrix );
	}
	
	//propagate to childs		
	if(update_childs)
	{
		for(var i = 0; i < this.children.length; i++)
			this.children[i].updateGlobalMatrix(true, update_childs);
	}
}

/**
* recompute local and global matrix
* @method updateMatrices
* @param {bool} [fast=false] uses the global matrix as it is in the parent node instead of crawling all the ierarchy
*/
SceneNode.prototype.updateMatrices = function(fast)
{
	this.updateLocalMatrix();
	this.updateGlobalMatrix(fast);
}

/**
* updates position, rotation and scale from the matrix
* @method fromMatrix
* @param {mat4} m the matrix
* @param {bool} [is_global=false] if the matrix is in global or local space
*/
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
	this._scale[0] = vec3.length( mat4.rotateVec3(tmp,M,RD.RIGHT) );
	this._scale[1] = vec3.length( mat4.rotateVec3(tmp,M,RD.UP) );
	this._scale[2] = vec3.length( mat4.rotateVec3(tmp,M,RD.BACK) );

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

/**
* Returns a point multiplied by the local matrix
* @method getLocalPoint
* @param {vec3} v the point
* @param {vec3} [result=vec3] where to store the output
* @return {vec3} result
*/
SceneNode.prototype.getLocalPoint = function(v, result)
{
	result = result || vec3.create();
	if(this._must_update_matrix)
		this.updateLocalMatrix();
	return vec3.transformMat4(result, v, this._local_matrix );	
}

/**
* Returns a point rotated by the local rotation
* @method getLocalVector
* @param {vec3} v the point
* @param {vec3} [result=vec3] where to store the output
* @return {vec3} result
*/
SceneNode.prototype.getLocalVector = function(v, result)
{
	result = result || vec3.create();
	return vec3.transformQuat( result, v, this._rotation );
}

/**
* Returns the node position in global coordinates
* @method getGlobalPosition
* @param {vec3} [result=optional] where to store the output
* @param {Boolean} [fast=optional] uses the current global amtrix without recomputing it, is faster but if the current matrix hasnt been updated the result will be wrong
* @return {vec3} result
*/
SceneNode.prototype.getGlobalPosition = function(result, fast)
{
	result = result || vec3.create();

	if(fast)
		return vec3.transformMat4( result, RD.ZERO, this._global_matrix );

	if(this._parent == this._scene._root)
	{
		result.set( this._position );
		return result;
	}

	var m = this.getGlobalMatrix();
	return vec3.transformMat4(result, RD.ZERO, m );
}

/**
* Returns a point multiplied by the global matrix
* @method getGlobalPoint
* @param {vec3} v the point
* @param {vec3} [result=vec3] where to store the output
* @return {vec3} result
*/
SceneNode.prototype.getGlobalPoint = function(v, result)
{
	result = result || vec3.create();
	var m = this.getGlobalMatrix();
	return vec3.transformMat4(result, v, m );	
}

SceneNode.prototype.localToGlobal = SceneNode.prototype.getGlobalPoint;

/**
* Returns a point rotated by the global matrix
* @method getGlobalVector
* @param {vec3} v the point
* @param {vec3} [result=vec3] where to store the output
* @return {vec3} result
*/
SceneNode.prototype.getGlobalVector = function(v, result)
{
	result = result || vec3.create();
	var quat = this.getGlobalRotation(temp_quat);
	return vec3.transformQuat( result, v, quat );
}

/**
* Returns the distance between the center of the node and the position in global coordinates
* @method getDistanceTo
* @param {vec3} position the point
* @return {number} result
*/
SceneNode.prototype.getDistanceTo = function(position)
{
	var m = this.getGlobalMatrix();
	return vec3.distance(position, m.subarray(12,15));
}


/**
* Searchs the node and returns the first child node with the matching id, it is a recursive search so it is slow
* @method findNode
* @param {string} id the id of the node
* @return {SceneNode} result node otherwise null
*/
SceneNode.prototype.findNode = function(id)
{
	for(var i = 0, l = this.children.length; i < l; i++)
	{
		var node = this.children[i];
		if( node.id == id )
			return node;
		var r = node.findNode(id);
		if(r)
			return r;
	}
	return null;
}

/**
* calls a function in child nodes
* @method propagate
* @param {String} method name
* @param {Array} params array containing the params
*/
SceneNode.prototype.propagate = function(method, params)
{
	for(var i = 0, l = this.children.length; i < l; i++)
	{
		var node = this.children[i];
		if(!node) //¿?
			continue;
		//has method
		if(node[method])
			node[method].apply(node, params);
		//recursive
		if(node.children && node.children.length)
			node.propagate(method, params);
	}
}

//not used yet
SceneNode.prototype.loadTextConfig = function(url, callback)
{
	var that = this;
	GL.request(url, null, function(data) {
		var info = RD.parseTextConfig(data);
		if(callback)
			callback(info);
        }, alert);
}

/**
* calls to be removed from the scene
* @method destroy
* @param { Boolean } force [optional] force to destroy the resource now instead of deferring it till the update ends
*/
SceneNode.prototype.destroy = function( force )
{
	//in case this node doesnt belong to a scene, we just remove it from its parent
	if(!this.scene || force)
	{
		if(this._parent)
			this._parent.removeChild(this);
		return;
	}

	//deferred: otherwise we put it pending to destroy
	this.scene._to_destroy.push(this);
}

/**
* Updates the bounding box in this node, taking into account the mesh bounding box and its children
* @method updateBoundingBox
* @param { Boolean } force [optional] force to destroy the resource now instead of deferring it till the update ends
*/
SceneNode.prototype.updateBoundingBox = function( ignore_children )
{
	var model = this._global_matrix;
	var mesh = gl.meshes[ this.mesh ];

	var bb = null;
	if( mesh ) 
	{
		var mesh_bb = mesh.getBoundingBox();
		if(!this.bounding_box)
			this.bounding_box = BBox.create();
		bb = BBox.transformMat4( this.bounding_box, mesh_bb, model );
	}

	if(ignore_children || !this.children || this.children.length == 0)
		return bb;

	for(var i = 0; i < this.children.length; ++i)
	{
		var child = this.children[i];
		var child_bb = child.updateBoundingBox();
		if(!child_bb)
			continue;
		if(!bb)
			bb = this.bounding_box = BBox.create();
		BBox.merge( bb, bb, child_bb );
	}

	return bb;
}

/**
* Tests if the ray collides with this node mesh or the childrens
* @method testRay
* @param { GL.Ray } ray the object containing origin and direction of the ray
* @param { vec3 } result where to store the collision point
* @param { Number } max_dist the max distance of the ray
* @param { Number } layers the layers where you want to test
* @param { Boolean } test_against_mesh if true it will test collision with mesh, otherwise only boundings
* @return { RD.SceneNode } the node where it collided
*/
SceneNode.prototype.testRay = (function(){ 

	var collision_point = vec3.create();
	var collision_point2 = vec3.create();
	var origin = vec3.create();
	var direction = vec3.create();
	var end = vec3.create();
	var inv = mat4.create();
	var local_collision = mat4.create();

	return function( ray, result, max_dist, layers, test_against_mesh )
	{
		max_dist = max_dist === undefined ? Number.MAX_VALUE : max_dist;

		if(Scene._ray_tested_objects !== undefined)
			Scene._ray_tested_objects++;
		var node = null;

		//test with this node mesh 
		var collided = null;
		if( (this.layers & layers) && this.mesh && !this.flags.ignore_collisions )
			collided = this.testRayWithMesh( ray, collision_point, max_dist, layers, test_against_mesh );

		//update closest point if there was a collision
		if(collided)
		{
			var distance = vec3.distance( ray.origin, collision_point );
			if( distance < max_dist)
			{
				max_dist = distance;
				result.set( collision_point );
				node = this;
			}
		}

		//if no children, then return current collision
		if( !this.children && !this.children.length )
			return node;

		//test against children
		for(var i = 0 ; i < this.children.length; ++ i )
		{
			var child = this.children[i];
			var child_collided = child.testRay( ray, collision_point2, max_dist, layers, test_against_mesh );
			if(!child_collided)
				continue;
			var distance = vec3.distance( ray.origin, collision_point2 );
			if( distance < max_dist )
			{
				max_dist = distance;
				result.set( collision_point );
				node = child_collided;
			}
		}
		
		return node;
	}
})();


/**
* Tests if the ray collides with the mesh in this node
* @method testRayWithMesh
* @param { GL.Ray } ray the object containing origin and direction of the ray
* @param { vec3 } result where to store the collision point
* @param { Number } max_dist the max distance of the ray
* @param { Number } layers the layers where you want to test
* @param { Boolean } test_against_mesh if true it will test collision with mesh, otherwise only bounding
* @return { Boolean } true if it collided
*/
SceneNode.prototype.testRayWithMesh = (function(){ 
	var temp = vec3.create();
	var origin = vec3.create();
	var direction = vec3.create();
	var end = vec3.create();
	var inv = mat4.create();

	return function( ray, result, max_dist, layers, test_against_mesh )
	{
		max_dist = max_dist === undefined ? Number.MAX_VALUE : max_dist;

		if( !this.mesh )
			return false;

		var mesh = gl.meshes[ this.mesh ];
		if( !mesh ) //mesh not loaded
			return false;

		var bb = mesh.getBoundingBox();
		if(!bb) //mesh has no vertices
			return false;

		//ray to local
		var model = this._global_matrix;
		mat4.invert( inv, model );
		vec3.transformMat4( origin, ray.origin, inv );
		vec3.add( end, ray.origin, ray.direction );
		vec3.transformMat4( end, end, inv );
		vec3.sub( direction, end, origin );
		vec3.normalize( direction, direction );

		//test against object oriented bounding box
		var r = geo.testRayBBox( origin, direction, bb, null, temp );
		if(!r) //collided with OOBB
			return false;

		vec3.transformMat4( result, temp, model );
		var distance = vec3.distance( ray.origin, result );

		//there was a collision but too far
		if( distance > max_dist )
			return false; 
		
		//test agains mesh
		if( !test_against_mesh )
			return true;

		//create mesh octree
		if(!mesh.octree)
			mesh.octree = new GL.Octree( mesh );

		//ray test agains octree
		var hit_test = mesh.octree.testRay( origin, direction, 0, max_dist, this.flags.two_sided );

		//collided the OOBB but not the mesh, so its a not
		if( !hit_test ) 
			return false;

		//compute global hit point
		result.set( hit_test.hit );
		vec3.transformMat4( result, result, model );
		var distance = vec3.distance( ray.origin, result );

		//there was a collision but too far
		if( distance > max_dist )
			return false; 
		return true;
	}
})();

/**
* adjust the rendering range so it renders one specific submesh of the mesh
* @method setRangeFromSubmesh
* @param {String} submesh_id could be the index or the string with the name
*/
SceneNode.prototype.setRangeFromSubmesh = function( submesh_id )
{
	if(submesh_id === undefined || !this.mesh)
	{
		this.draw_range = null;
		return;
	}
		
	var mesh = gl.meshes[ this.mesh ];
	if(!mesh || !mesh.info || !mesh.info.groups)
	{
		console.warn("you cannot set the submesh_id while the mesh is not yet loaded");
		return;
	}

	//allows to search by string or index
	if( submesh_id.constructor === String )
	{
		for(var i = 0; i < mesh.info.groups.length; ++i)
		{
			var info = mesh.info.groups[i];
			if( info.name == submesh_id )
			{
				submesh_id = i;
				break;
			}
		}

		if( i === mesh.info.groups.length )
			return false; //not found
	}

	var submesh = mesh.info.groups[ submesh_id ];
	if(!submesh)
		return;

	this.draw_range[0] = submesh.start;
	this.draw_range[1] = submesh.length;
}

/**
* Sprite class , inherits from SceneNode but helps to render 2D planes (in 3D Space)
* @class Sprite
* @constructor
*/
function Sprite(o)
{
	this._ctor();
	if(o)
		this.configure(o);
}

Sprite.prototype._ctor = function()
{
	SceneNode.prototype._ctor.call(this);

	this.mesh = "plane";
	this.size = vec2.fromValues(1,1);
	this.blend_mode = RD.BLEND_ALPHA;
	this.flags.two_sided = true;
	this.flags.depth_test = false;
	this.flags.flipX = false;
	this.flags.flipY = false;
	this.shader = "texture_transform";
	this._angle = 0;

	this.frame = null;
	this.frames = {};
	this.texture_matrix = mat3.create();
	
	this._uniforms["u_texture_matrix"] = this.texture_matrix;
}

Object.defineProperty(Sprite.prototype, 'angle', {
	get: function() { return this._angle; },
	set: function(v) { this._angle = v; quat.setAxisAngle( this._rotation, RD.FRONT, this._angle * DEG2RAD ); this._must_update_matrix = true; },
	enumerable: true //avoid problems
});

Sprite.prototype.setSize = function(w,h)
{
	this.size[0] = w;
	this.size[1] = h;
}

//static version
Sprite.createFrames = function(num_rows, names, frames)
{
	frames = frames || {};
	var x = 0;
	var y = 0;
	var offset = 1/num_rows;
	for(var i in names)
	{
		frames[ names[i] ] = { pos:[x,y], size:[offset,offset], normalized: true };
		x += offset;
		if(x >= 1)
		{
			x = 0;
			y += offset;
		}
		if(y >= 1)
			return frames;
	}
	return frames;
}

Sprite.prototype.createFrames = function(num_rows, names)
{
	Sprite.createFrames(num_rows, names, this.frames );
}

Sprite.prototype.addFrame = function(name, x,y, w,h, normalized )
{
	this.frames[ name ] = { pos: vec2.fromValues(x,y), size: vec2.fromValues(w,h), normalized: !!normalized };
}

Sprite.prototype.updateTextureMatrix = function( renderer )
{
	mat3.identity( this.texture_matrix );
	//no texture
	if(!this.texture)
		return false;
	
	var texture = renderer.textures[ this.texture ];
	if(!texture && renderer.autoload_assets) 
	{
		var that = this;
		if(this.texture.indexOf(".") != -1)
			renderer.loadTexture( this.texture, renderer.default_texture_settings, function(tex){
				if(tex)
					that.setSize( tex.width, tex.height );	
			});
		texture = gl.textures[ "white" ];
	}
	if(!texture) //texture not found
		return false;
		
	//adapt texture matrix
	var matrix = this.texture_matrix;
		
	var frame = this.frames[ this.frame ];
	
	//frame not found
	if(this.frame !== null && !frame)
		return false;
	
	if(!frame)
	{
		if(this.flags.flipX)
		{
			temp_vec2[0] = this.flags.flipX ? 1 : 0; 
			temp_vec2[1] = 0;
			mat3.translate( matrix, matrix, temp_vec2 );
			temp_vec2[0] = (this.flags.flipX ? -1 : 1); 
			temp_vec2[1] = 1;
			mat3.scale( matrix, matrix, temp_vec2 );
		}
		return true;
	}
	
	if(frame.normalized)
	{
		temp_vec2[0] = this.flags.flipX ? frame.pos[0] + frame.size[0] : frame.pos[0]; 
		temp_vec2[1] = 1 - frame.pos[1] - frame.size[1];
		mat3.translate( matrix, matrix, temp_vec2 );
		temp_vec2[0] = frame.size[0] * (this.flags.flipX ? -1 : 1); 
		temp_vec2[1] = frame.size[1];
		mat3.scale( matrix, matrix, temp_vec2 );
	}
	else
	{
		var tw = texture.width;
		var th = texture.height;
		temp_vec2[0] = (this.flags.flipX ? frame.pos[0] + frame.size[0] : frame.pos[0]) / tw; 
		temp_vec2[1] = (th - frame.pos[1] - frame.size[1]) / th;
		mat3.translate( matrix, matrix, temp_vec2 );
		temp_vec2[0] = (frame.size[0] * (this.flags.flipX ? -1 : 1)) / texture.width; 
		temp_vec2[1] = frame.size[1] / texture.height;
		mat3.scale( matrix, matrix, temp_vec2 );
	}
	
	return true;
}

Sprite.prototype.render = function(renderer, camera)
{
	if(!this.texture)
		return;	
		
	if(this.updateTextureMatrix(renderer))
	{
		if(this.billboard_mode)
			RD.Billboard.orientNode( this, camera, renderer );
		else
		{
			mat4.scale( this._global_matrix, this._global_matrix, [this.size[0], this.size[1], 1 ] );
			renderer.setModelMatrix( this._global_matrix );
		}
		renderer.renderNode( this, renderer, camera );
	}
}

extendClass( Sprite, SceneNode );
RD.Sprite = Sprite;


/**
* Scene holds the full scene graph, use root to access the root child
* @class Scene
* @constructor
*/
function Scene()
{
	this._root = new RD.SceneNode();
	this._root.flags.no_transform = true; //avoid extra matrix multiplication
	this._root._scene = this;
	this._nodes_by_id = {};
	this._to_destroy = [];

	this.time = 0;
	this.frame = 0;
}

RD.Scene = Scene;

/**
* clears all nodes inside
* @method clear
*/
Scene.prototype.clear = function()
{
	this._root = new RD.SceneNode();
	this._root._scene = this;
	this.time = 0;
}

/**
* returns gets node by id
* @method getNodeById
*/
Scene.prototype.getNodeById = function(id)
{
	return this._nodes_by_id[id];
	//return this._root.findNode(id);
}

/**
* propagate update method
* @method update
* @param {number} dt
*/
Scene.prototype.update = function(dt)
{
	this.time += dt;
	this._root.propagate("update",[dt]);
	this.destroyPendingNodes();
}

Scene.prototype.destroyPendingNodes = function(dt)
{
	//destroy entities marked
	if(!this._to_destroy.length)
		return;

	var n = null;
	while( n = this._to_destroy.pop() )
	{
		if(n._parent)
			n._parent.removeChild(n);
	}
}

/**
* The root node
* @property root {RD.SceneNode}
*/
Object.defineProperty(Scene.prototype, 'root', {
	get: function() { return this._root; },
	set: function(v) { throw("Cannot set root of scene"); },
	enumerable: false //avoid problems
});

/**
* test collision of this ray with nodes in the scene
* @method testRay
* @param {RD.Ray} ray
* @param {vec3} result the collision point in case there was
* @param {number} max_dist
* @param {number} layers mask
* @param {boolean} test_against_mesh test against every mesh
* @return {RD.SceneNode} node collided or null
*/
Scene.prototype.testRay = function( ray, result, max_dist, layers, test_against_mesh  )
{
	layers = layers === undefined ? 0xFF : layers;
	Scene._ray_tested_objects = 0;
	if(!result)
		result = temp_vec3;

	//TODO
	//broad phase
		//get all the AABBs of all objects
		//store them in an octree

	return this.root.testRay( ray, result, max_dist, layers, test_against_mesh );
}


/**
* Renderer in charge of rendering a Scene
* Valid options: all LiteGL context creation options (canvas, WebGL Flags, etc), plus: assets_folder, autoload_assets, shaders_file
* @class Renderer
* @constructor
*/
function Renderer( context, options )
{
	options = options || {};
	
	var gl = this.gl = this.context = context;
	if(!gl || !gl.enable)
		throw("litegl GL context not found.");
	
	if(context != global.gl)
		gl.makeCurrent();
			
	this.point_size = 5;
	this.sort_by_priority = true;
	this.sort_by_distance = false;
	
	this.assets_folder = "";
	
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
		u_mvp: this._mvp_matrix,
		u_global_alpha_clip: 0.0
	};
	
	//set some default stuff
	global.gl = this.gl;
	this.canvas = gl.canvas;

	this.assets_folder = options.assets_folder || "";
	this.autoload_assets = options.autoload_assets !== undefined ? options.autoload_assets : true;
	this.default_texture_settings = { wrap: gl.REPEAT, minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.LINEAR };
	
	//global containers and basic data
	this.meshes["plane"] = GL.Mesh.plane({size:1});
	this.meshes["planeXZ"] = GL.Mesh.plane({size:1,xz:true});
	this.meshes["cube"] = GL.Mesh.cube({size:1,wireframe:true});
	this.meshes["sphere"] = GL.Mesh.sphere({size:1, subdivisions: 32, wireframe:true});
	this.meshes["grid"] = GL.Mesh.grid({size:10});
	
	this.textures["notfound"] = this.default_texture = new GL.Texture(1,1,{ filter: gl.NEAREST, pixel_data: new Uint8Array([0,0,0,255]) });
	this.textures["white"] = this.default_texture = new GL.Texture(1,1,{ filter: gl.NEAREST, pixel_data: new Uint8Array([255,255,255,255]) });
	
	this.num_assets_loading = 0;
	this.assets_loading = {};
	this.assets_not_found = {};
	this.frame = 0;
	this.draw_calls = 0;

	this.createShaders();

	if(options.shaders_file)
		this.loadShaders( options.shaders_file, null, options.shaders_macros );
	
}

RD.Renderer = Renderer;

/**
* whats the data folder where all data should be fetch
* @method setDataFolder
* @param {string} path
*/
Renderer.prototype.setDataFolder = function(path)
{
	if(!path)
	{
		this.assets_folder = "";
		return;
	}
	
	this.assets_folder = path;
		
	if( this.assets_folder.substr(-1) != '/' )
		this.assets_folder += '/';
}

/**
* clear color and depth buffer
* @method clear
* @param {vec4} color clear color
*/
Renderer.prototype.clear = function( color )
{
	if(color)	
		this.gl.clearColor( color[0],color[1],color[2], color.length >= 3 ? color[3] : 1.0 );
	else
		this.gl.clearColor( 0,0,0,0 );
	this.gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
}

Renderer._sort_by_dist_func = function(a,b)
{
	return b._distance - a._distance;
}

Renderer._sort_by_priority_func = function(a,b)
{
	return b.render_priority - a.render_priority;
}

Renderer._sort_by_priority_and_dist_func = function(a,b)
{
	var r = b.render_priority - a.render_priority;
	if(r != 0)
		return r;
	return b._distance - a._distance;
}

/**
* renders once scene from one camera
* @method render
* @param {RD.Scene} scene
* @param {RD.Camera} camera
* @param {Array} nodes [Optional] array with nodes to render, otherwise all nodes will be rendered
*/
Renderer.prototype.render = function(scene, camera, nodes, layers )
{
	if(layers === undefined)
		layers = 0xFF;

	if (!scene)
		throw("Renderer.render: scene not provided");

	if(	this._current_scene )
	{
		this._current_scene = null;
		throw("Cannot render an scene while rendering an scene");
	}
	this._current_scene = scene;

	camera = camera || scene.camera;
	if (!camera)
		throw("Renderer.render: camera not provided");
	
	global.gl = this.gl;
	
	//stack to store state
	this._state = [];
	this._meshes_missing = 0;
	//this.draw_calls = 0;

	//get matrices in the camera
	this.enableCamera( camera );

	//find which nodes should we render
	this._nodes.length = 0;
	if(!nodes)
		scene._root.getVisibleChildren( this._nodes, layers );
	nodes = nodes || this._nodes;

	if(nodes.length)
	{
		//set globals
		this._uniforms.u_time = scene.time;

		//precompute distances
		if(this.sort_by_distance)
			nodes.forEach( function(a) { a._distance = a.getDistanceTo( camera._position ); } );
		
		//filter by mustRender
		var that = this;
		nodes = nodes.filter( function(n) { return !n.mustRender || n.mustRender(that,camera) != false; }); //GC
		
		//sort 
		if(this.sort_by_distance && this.sort_by_priority)
			nodes.sort( RD.Renderer._sort_by_priority_and_dist_func );
		else if(this.sort_by_priority)
			nodes.sort( RD.Renderer._sort_by_priority_func );
		else if(this.sort_by_distance)
			nodes.sort( RD.Renderer._sort_by_dist_func );
		
		//pre rendering
		if(scene._root.preRender)
			scene._root.preRender(this,camera);
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
			if(node.flags.visible === false || !(node.layers & layers) )
				continue;
			if(this.mustRenderNode && this.mustRenderNode(node, camera) === false)
				continue;
			
			this.setModelMatrix( node._global_matrix );
			
			if(node.render)
				node.render(this, camera);
			else
				this.renderNode(node, camera);
			this.draw_calls += 1;
		}
		
		//post rendering
		if(scene._root.postRender)
			scene._root.postRender(this,camera);
		for (var i = 0; i < nodes.length; ++i)
		{
			var node = nodes[i];
			if(node.postRender)
				node.postRender(this,camera);
		}

	}//nodes.length
	
	scene.frame++;
	this.frame++;
	this._current_scene = null;
}

Renderer.prototype.enableCamera = function(camera)
{
	this._camera = camera;	
	camera.updateMatrices(); //multiply
	camera.extractPlanes(); //for frustrum culling
	
	this._view_matrix.set(camera._view_matrix);
	this._projection_matrix.set(camera._projection_matrix);
	this._viewprojection_matrix.set(camera._viewprojection_matrix);
	this._uniforms.u_camera_position = camera.position;
}

//this functions allow to interrupt the render of one scene to render another one
Renderer.prototype.saveState = function()
{
	var state = {
		camera: this._camera,
		nodes: this._nodes
	};
	
	this.state.push(state);
}

Renderer.prototype.restoreState = function()
{
	var state = this.state.pop();
	var camera = this.camera = state.camera;
	this._view_matrix.set(camera._view_matrix);
	this._projection_matrix.set(camera._projection_matrix);
	this._viewprojection_matrix.set(camera._viewprojection_matrix);
	this._uniforms.u_camera_position = camera.position;
	this._nodes = state.nodes;
}


Renderer.prototype.setModelMatrix = function(matrix)
{
	this._model_matrix.set( matrix );
	mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, matrix );
}

//allows to add some global uniforms without overwritting the existing ones
Renderer.prototype.setGlobalUniforms = function( uniforms )
{
	for(var i in uniforms)
	{
		if( this._uniforms[i] && this._uniforms[i].set )
			this._uniforms[i].set( uniforms[i] );
		else
			this._uniforms[i] = uniforms[i];
	}
}

Renderer.prototype.renderNode = function(node, camera)
{
	//get mesh
	var mesh = null;
	if (node._mesh) //hardcoded mesh
		mesh = node._mesh;
	else if (node.mesh) //shared mesh
	{
		mesh = gl.meshes[node.mesh];
		if(!mesh)
		{
			this._meshes_missing++;
			if(this.autoload_assets && node.mesh.indexOf(".") != -1)
				this.loadMesh( node.mesh );
		}
	}
		
	if(!mesh)
	{
		if(node.onRender)
			node.onRender(this, camera, shader);
		return;
	}

	//get shader
	var shader = null;
	var shader_name = node.shader;
	if (this.on_getShader)
		shader = this.on_getShader( node, camera );
	if (!shader && node.shader)
		shader = gl.shaders[ shader_name ];
	if(this.shader_overwrite)
		shader = gl.shaders[this.shader_overwrite];
	if (!shader)
		shader = node.textures.color ? this._texture_shader : this._flat_shader;
	
	//get texture
	var slot = 0;
	var texture = null;
	for(var i in node.textures)
	{
		var texture_name = node.textures[i];
		if(!texture_name)
			continue;
		var texture_uniform_name = "u_" + i + "_texture";

		if(shader && !shader.samplers[texture_uniform_name]) //texture not used in shader
			continue; //do not bind it

		texture = gl.textures[ texture_name ];
		if(!texture)
		{
			if(this.autoload_assets && texture_name.indexOf(".") != -1)
				this.loadTexture( texture_name, this.default_texture_settings );
			texture = gl.textures[ "white" ];
		}
		node._uniforms[texture_uniform_name] = texture.bind( slot++ );
	}

	//flags
	if(!this.ignore_flags)
	{
		gl.frontFace( node.flags.flip_normals ? gl.CW : gl.CCW );
		gl[ node.flags.depth_test === false ? "disable" : "enable"]( gl.DEPTH_TEST );
		if( node.flags.depth_write === false )
			gl.depthMask( false );
		gl[ node.flags.two_sided === true ? "disable" : "enable"]( gl.CULL_FACE );
		
		//blend
		if(	node.blend_mode !== RD.BLEND_NONE )
		{
			gl.enable( gl.BLEND );
			switch( node.blend_mode )
			{
				case RD.BLEND_ALPHA: gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA ); break;
				case RD.BLEND_ADD: gl.blendFunc( gl.SRC_ALPHA, gl.ONE ); break;
				case RD.BLEND_MULTIPLY: gl.blendFunc( gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA ); break;
			}
		}
		else
			gl.disable( gl.BLEND );
	}
	
	if(node.onRender)
		node.onRender(this, camera, shader);
	
	shader.uniforms( this._uniforms ); //globals
	shader.uniforms( node._uniforms ); //node specifics

	if(node.onShaderUniforms) //in case the node wants to add extra shader uniforms that need to be computed at render time
		node.onShaderUniforms(this, shader);
	
	if(node.draw_range)
		shader.drawRange( mesh, node.primitive === undefined ? gl.TRIANGLES : node.primitive, node.draw_range[0], node.draw_range[1] , node.indices );
	else
		shader.draw( mesh, node.primitive === undefined ? gl.TRIANGLES : node.primitive, node.indices );

	if(!this.ignore_flags)
	{
		if( node.flags.flip_normals ) gl.frontFace( gl.CCW );
		if( node.flags.depth_test === false ) gl.enable( gl.DEPTH_TEST );
		if( node.blend_mode !== RD.BLEND_NONE ) gl.disable( gl.BLEND );
		if( node.flags.two_sided ) gl.disable( gl.CULL_FACE );
		if( node.flags.depth_write === false )
			gl.depthMask( true );
	}
}

Renderer.prototype.setPointSize = function(v)
{
	this.point_size = v;
	gl.shaders["point"].uniforms({u_pointSize: this.point_size});
}

/**
* Loads one mesh and stores inside the meshes object to be reused in the future, if it is already loaded it skips the loading
* @method loadMesh
* @param {String} name name (and url) of the mesh
* @param {Function} on_complete callback
*/
Renderer.prototype.loadMesh = function( url, on_complete )
{
	if(!url)
		return console.error("loadMesh: Cannot load null name");

	if( this.assets_loading[url] || this.assets_not_found[url] )
		return;

	var name = url;
	/* no options
	if(options)
	{
		if(options.name)
			name = options.name;
		if(options.preview)
			name = options.preview;
	}
	*/

	//check if we have it
	var mesh = this.meshes[ name ];
	if(mesh)
	{
		if(on_complete)
			on_complete( mesh );
		return mesh;
	}

	var that = this;
	
	//load it
	var full_url = url;
	if(full_url.indexOf("://") == -1)
		full_url = this.assets_folder + url;

	var new_mesh = GL.Mesh.fromURL( full_url, function(m){
		if(!m)
		{
			that.assets_not_found[ url ] = true;
			delete that.meshes[ url ];
		}
		else
			that.meshes[ name ] = m;
		that.num_assets_loading--;
		delete that.assets_loading[ url ];
		if(on_complete)
			on_complete(m, url);
	});

	this.assets_loading[ url ] = new_mesh;
	this.num_assets_loading++;
	
	this.meshes[ name ] = new_mesh; //temporary mesh
	return new_mesh;
}

/**
* Loads one texture and stores inside the textures object to be reused in the future, if it is already loaded it skips the loading
* @method loadTexture
* @param {String} name name (and url) of the texture
* @param {Object} options texture options as in litegl (option.name is used to store it with a different name)
* @param {Function} on_complete callback
*/
Renderer.prototype.loadTexture = function( url, options, on_complete )
{
	if(!url)
		return console.error("loadTexture: Cannot load null name");

	if( this.assets_loading[url] || this.assets_not_found[url] )
		return;

	var name = url;
	if(options)
	{
		if(options.name)
			name = options.name;
		if(options.preview)
			name = options.preview;
	}

	//check if we have it
	var tex = this.textures[ name ];
	if(tex && !tex.is_preview)
	{
		if(on_complete)
			on_complete(tex);
		return tex;
	}

	var that = this;
	
	//load it
	var full_url = url;
	if(full_url.indexOf("://") == -1)
		full_url = this.assets_folder + url;

	var new_tex = GL.Texture.fromURL( full_url, options, function(t){
		if(!t)
			that.assets_not_found[ url ] = true;
		else
			that.textures[ name ] = t;
		if(on_complete)
			on_complete(t, name);
		that.num_assets_loading--;
		delete that.assets_loading[ url ];
		if(that.on_texture_load)
			that.on_texture_load(t, name);
	});

	if(options && options.preview)
		new_tex.is_preview = true;

	this.assets_loading[ url ] = new_tex;
	this.num_assets_loading++;
	
	this.textures[ name ] = new_tex;
	return new_tex;
}

Renderer.prototype.loadTextureAtlas = function(data, url, on_complete)
{
	if(typeof(data) == "string")
		data = JSON.parse(data);
	var that = this;
	
	if(url.indexOf("://") == -1)
		url = this.assets_folder + url;
	
	var atlas = GL.Texture.fromURL(url, null, function(tex){
		var files = data.files;
		that.textures[":atlas"] = tex;
		for(var i in files)
		{
			//do not overwrite textures
			if(that.textures[i] && !that.textures[i].is_preview)
				continue;
			var file = files[i];
			var mini_tex = new GL.Texture(data.size,data.size,{ wrap: gl.REPEAT, filter: gl.LINEAR });
			mini_tex.drawTo(function(){
				tex.gl.drawTexture(tex,0,0,data.size,data.size, file.x, file.y, file.width || data.size, file.height || data.size);
			});
			mini_tex.is_preview = true;
			//save preview
			that.textures[i] = mini_tex;
		}

		if(on_complete)
			on_complete(files);
	});
}

/**
* Loads a shaders file in the Atlas file format (check GL.loadFileAtlas in litegl)
* @method loadShaders
* @param {String} url url to text file containing all the shader files
* @param {Function} on_complete callback
* @param {Object} extra_macros object containing macros that must be included in all
*/
Renderer.prototype.loadShaders = function(url, on_complete, extra_macros)
{
	var that = this;
	
	if(url.indexOf("://") == -1)
		url = this.assets_folder + url;

	this.loading_shaders = true;
	
	//load shaders code from a files atlas
	GL.loadFileAtlas( url, function(files){
		that.compileShadersFromAtlas( files, extra_macros );
		that.loading_shaders = false;
		if(on_complete)
			on_complete(files);
	});
}

Renderer.prototype.compileShadersFromAtlas = function(files, extra_macros)
{
	var info = files["shaders"];
	 if(!info)
	 {
		console.warn("No 'shaders' found in shaders file atlas, check documentation");
		return;
	 }
	 
	//expand #imports "..."
	for(var i in files)
		files[i] = GL.Shader.expandImports( files[i], files );
	 
	//compile shaders
	var lines = info.split("\n");
	for(var i in lines)
	{
		var line = lines[i];
		var t = line.trim().split(" ");
		var name = t[0].trim();
		if(name.substr(0,2) == "//")
			continue;
		var vs = files[ t[1] ];
		var fs = files[ t[2] ];
		var macros = null;
		var flags = {};

		//parse extras
		if(t.length > 3)
		{
			for(var j = 3; j < t.length; ++j)
			{
				if(t[j][0] == "#")
					flags[t[j].substr(1)] = true;
				else
				{
					macros = t.slice(j).join(" ");
					break;
				}
			}
		}

		if(flags.WEBGL1 && gl.webgl_version != 1)
			continue;
		if(flags.WEBGL2 && gl.webgl_version != 2)
			continue;
		
		if(t[1] && t[1][0] == '@')
		{
			var pseudoname = t[1].substr(1) + "_VERTEX_SHADER";
			if(GL.Shader[pseudoname])
				vs = GL.Shader[pseudoname];
		}
		if(t[2] && t[2][0] == '@')
		{
			var pseudoname = t[2].substr(1) + "_FRAGMENT_SHADER";
			if(GL.Shader[pseudoname])
				fs = GL.Shader[pseudoname];
		}
		
		if(macros)
		{
			try
			{
				macros = JSON.parse(macros);
			}
			catch (err)
			{
				console.error("Error in shader macros: ", name, macros, err);
			}
		}
		
		if(macros && extra_macros)
		{
			var final_macros = {};
			for(var i in macros)
				final_macros[i] = macros[i];
			for(var i in extra_macros)
				final_macros[i] = extra_macros[i];
			macros = final_macros;
		}
		else if(extra_macros)
			macros = extra_macros;

		//console.log("compiling: ",name,macros);

		try
		{
			if(!vs || !fs)
			{
				console.warn("Shader subfile not found: ",t[1],t[2]);
				continue;
			}
			
			if( this.shaders[ name ] )
				this.shaders[ name ].updateShader( vs, fs, macros );
			else
				this.shaders[ name ] = new GL.Shader( vs, fs, macros );
		}
		catch (err)
		{
			GL.Shader.dumpErrorToConsole(err,vs,fs);
		}
	}
}

Renderer.prototype.setShadersFromFile = function( file_data )
{
	var files = GL.processFileAtlas( file_data );
	this.compileShadersFromAtlas( files );
}


RD.sortByDistance = function(nodes, position)
{
	nodes.forEach( function(a) { a._distance = a.getDistanceTo(position); } );
	nodes.sort(function(a,b) { return b._distance - a._distance; } );
}

RD.noBlending = function(n)
{
	return n.blend_mode === RD.BLEND_NONE;
}


RD.generateTextureAtlas = function(textures, width, height, item_size, avoid_repetitions)
{
	width = width || 1024;
	height = height || 1024;
	item_size = item_size || 64;
	var count = 0;
	for(var i in textures)
		count++;
		
	gl.disable(gl.DEPTH_TEST);
	gl.disable(gl.CULL_FACE);
	gl.disable(gl.BLEND);
	
	var atlas = new GL.Texture(width,height);
	var atlas_info = { width: width, height: height, size: item_size, files: {}};
	var posx = 0, posy = 0;
	var hashes = {};
	
	atlas.drawTo( function()
	{
		for(var i in textures)
		{
			if(i[0] == ":" || i == "white" || i == "black" || i == "notfound")
				continue;
			var tex = textures[i];
			if(tex.is_preview)
				continue;
			if(tex.texture_type != gl.TEXTURE_2D)
				continue;
			
			if(avoid_repetitions)
			{
				var hash = tex.toBase64().hashCode();
				if( hashes[ hash ] )
				{
					atlas_info.files[i] = atlas_info.files[ hashes[ hash ] ];
					continue;
				}
				hashes[ hash ] = i;
			}
			
			atlas_info.files[i] = {x:posx, y:posy};
			tex.renderQuad(posx,posy,item_size,item_size);
			posx += item_size;
			if(posx == width)
			{
				posx = 0;
				posy += item_size;
				if(posy == height)
				{
					console.warn("Atlas too small, some textures wont be stored.");
					return;
				}
			}
		}
	} );
	
	atlas.info = atlas_info;
	console.log(atlas_info);
	return atlas;
}

//returns num of resources fully loaded from a list
Renderer.prototype.computeResourcesLoaded = function( list )
{
	var num = 0;
	for(var i in list)
	{
		var name = list[i];
		var tex = this.textures[name];
		if(tex && tex.ready === false)
			continue;

		var mesh = this.meshes[name];
		if(mesh && mesh.ready === false)
			continue;

		if(tex || mesh)
			num++;
	}
	return num;
}



/*
Renderer.prototype.loadMesh = function(url, name)
{
	var old_gl = global.gl;
	global.gl = this.gl;
	//load
	
	
	global.gl = old_gl;
}
*/

/**
* container with all the registered meshes (same as gl.meshes)
* @property meshes {Object}
*/
Object.defineProperty(Renderer.prototype, 'meshes', {
	get: function() { return this.gl.meshes; },
	set: function(v) {},
	enumerable: true
});

/**
* container with all the registered textures (same as gl.textures)
* @property textures {Object}
*/
Object.defineProperty(Renderer.prototype, 'textures', {
	get: function() { return this.gl.textures; },
	set: function(v) {},
	enumerable: true
});

/**
* container with all the registered shaders (same as gl.shaders)
* @property shaders {Object}
*/
Object.defineProperty(Renderer.prototype, 'shaders', {
	get: function() { return this.gl.shaders; },
	set: function(v) {},
	enumerable: true
});


Renderer.prototype.addMesh = function(name, mesh)
{
	if(mesh.gl != this.gl)
		mesh = mesh.cloneShared( this.gl );
	this.gl.meshes[name] = mesh;
}


RD.Renderer = Renderer;


/**
* for ray collision
* @class Ray
* @constructor
*/
function Ray( origin, direction )
{
	this.origin = vec3.create();
	this.direction = vec3.create();
	
	if(origin)
		this.origin.set( origin );
	if(direction)
		this.direction.set( direction );
}

RD.Ray = Ray;

/**
* Camera wraps all the info about the camera (properties and view and projection matrices)
* @class Camera
* @constructor
*/
function Camera( options )
{
	/**
	* the camera type, RD.Camera.PERSPECTIVE || RD.Camera.ORTHOGRAPHIC
	* @property type {number} 
	* @default RD.Camera.PERSPECTIVE
	*/
	this.type = RD.Camera.PERSPECTIVE;

	this._position = vec3.fromValues(0,100, 100);
	this._target = vec3.fromValues(0,0,0);
	this._up = vec3.fromValues(0,1,0);
	
	/**
	* near distance 
	* @property near {number} 
	* @default 0.1
	*/
	this.near = 0.1;
	/**
	* far distance 
	* @property far {number} 
	* @default 10000
	*/
	this.far = 10000;
	/**
	* aspect (width / height)
	* @property aspect {number} 
	* @default 1
	*/
	this.aspect = 1.0;
	/**
	* fov angle in degrees
	* @property fov {number}
	* @default 45
	*/
	this.fov = 45; //persp
	/**
	* size of frustrum when working in orthographic
	* @property frustum_size {number} 
	* @default 50
	*/
	this.frustum_size = 50; //ortho
	this.flip_y = false;

	this._view_matrix = mat4.create();
	this._projection_matrix = mat4.create();
	this._viewprojection_matrix = mat4.create();
	this._model_matrix = mat4.create(); //inverse of view
	
	this._autoupdate_matrices = true;
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

RD.Camera = Camera;

Camera.PERSPECTIVE = 1;
Camera.ORTHOGRAPHIC = 2;

/**
* Position where the camera eye is located
* @property position {vec3}
*/
Object.defineProperty(Camera.prototype, 'position', {
	get: function() { return this._position; },
	set: function(v) { this._position.set(v); this._must_update_matrix = true; },
	enumerable: false //avoid problems
});

/**
* Where the camera is looking at, the center of where is looking
* @property target {vec3}
*/
Object.defineProperty(Camera.prototype, 'target', {
	get: function() { return this._target; },
	set: function(v) { this._target.set(v); this._must_update_matrix = true; },
	enumerable: false //avoid problems
});

/**
* Up vector
* @property up {vec3}
* @default [0,1,0]
*/
Object.defineProperty(Camera.prototype, 'up', {
	get: function() { return this._up; },
	set: function(v) { this._up.set(v); this._must_update_matrix = true; },
	enumerable: false //avoid problems
});

/**
* changes the camera to perspective mode
* @method perspective
* @param {number} fov
* @param {number} aspect
* @param {number} near
* @param {number} far
*/
Camera.prototype.perspective = function(fov, aspect, near, far)
{
	this.type = Camera.PERSPECTIVE;
	this.fov = fov;
	this.aspect = aspect;
	this.near = near;
	this.far = far;
	
	this._must_update_matrix = true;
}

/**
* changes the camera to orthographic mode (frustumsize is top-down)
* @method orthographic
* @param {number} frustum_size
* @param {number} near
* @param {number} far
* @param {number} aspect
*/
Camera.prototype.orthographic = function(frustum_size, near, far, aspect)
{
	this.aspect = aspect || 1;
	this.type = Camera.ORTHOGRAPHIC;
	this.frustum_size = frustum_size;
	this.near = near;
	this.far = far;

	this._must_update_matrix = true;
}

/**
* configure view of the camera
* @method lookAt
* @param {vec3} position
* @param {vec3} target
* @param {vec3} up
*/
Camera.prototype.lookAt = function(position,target,up)
{
	vec3.copy(this._position, position);
	vec3.copy(this._target, target);
	vec3.copy(this._up, up);
	
	this._must_update_matrix = true;
}

/**
* update view projection matrices
* @method updateMatrices
*/
Camera.prototype.updateMatrices = function( force )
{
	if(this._autoupdate_matrices || force)
	{
		//proj
		if(this.type == Camera.ORTHOGRAPHIC)
			mat4.ortho(this._projection_matrix, -this.frustum_size*this.aspect, this.frustum_size*this.aspect, -this.frustum_size, this.frustum_size, this.near, this.far);
		else
			mat4.perspective(this._projection_matrix, this.fov * DEG2RAD, this.aspect, this.near, this.far);

		if(this.flip_y)
			mat4.scale( this._projection_matrix, this._projection_matrix, [1,-1,1] );

		//view
		mat4.lookAt(this._view_matrix, this._position, this._target, this._up);
	}

	mat4.multiply(this._viewprojection_matrix, this._projection_matrix, this._view_matrix );
	mat4.invert(this._model_matrix, this._view_matrix );
	
	this._must_update_matrix = false;

	mat4.rotateVec3( this._right, this._model_matrix, RD.RIGHT );
	mat4.rotateVec3( this._top,   this._model_matrix, RD.UP );
	mat4.rotateVec3( this._front, this._model_matrix, RD.FRONT );

	this.distance = vec3.distance(this._position, this._target);
}

Camera.prototype.getModel = function(m)
{
	m = m || mat4.create();
	mat4.invert(this._model_matrix, this._view_matrix );
	mat4.copy(m, this._model_matrix);
	return m;
}

/**
* update camera using a model_matrix as reference
* @method updateVectors
* @param {mat4} model_matrix
*/
Camera.prototype.updateVectors = function( model_matrix )
{
	var front = vec3.subtract( temp_vec3, this._target, this._position);
	var dist = vec3.length(front);
	mat4.multiplyVec3(this._position, model_matrix, RD.ZERO);
	mat4.multiplyVec3(this._target, model_matrix, [0,0,-dist]);
	mat4.rotateVec3(this._up, model_matrix, RD.UP);
}

/**
* transform vector (only rotates) from local to global
* @method getLocalVector
* @param {vec3} v
* @param {vec3} result [Optional]
* @return {vec3} local point transformed
*/
Camera.prototype.getLocalVector = function(v, result)
{
	if(this._must_update_matrix)
		this.updateMatrices();
		
	return mat4.rotateVec3( result || vec3.create(), this._model_matrix, v );
}

/**
* transform point from local to global
* @method getLocalVector
* @param {vec3} v
* @param {vec3} result [Optional]
* @return {vec3} local point transformed
*/
Camera.prototype.getLocalPoint = function(v, result)
{
	if(this._must_update_matrix)
		this.updateMatrices();
	
	return vec3.transformMat4( result || vec3.create(), v, this._model_matrix );
}

/**
* gets the front vector normalized 
* @method getFront
* @param {vec3} dest [Optional]
* @return {vec3} front vector
*/
Camera.prototype.getFront = function(dest)
{
	dest = dest || vec3.create();
	vec3.subtract(dest, this._target, this._position);
	vec3.normalize(dest, dest);
	return dest;
}

/**
* move the position and the target
* @method move
* @param {vec3} v
*/
Camera.prototype.move = function(v)
{
	vec3.add(this._target, this._target, v);
	vec3.add(this._position, this._position, v);
	this._must_update_matrix = true;
}

/**
* move the position and the target using the local coordinates system of the camera
* @method moveLocal
* @param {vec3} v
*/
Camera.prototype.moveLocal = function(v)
{
	var delta = mat4.rotateVec3(temp_vec3, this._model_matrix, v);
	vec3.add(this._target, this._target, delta);
	vec3.add(this._position, this._position, delta);
	this._must_update_matrix = true;
}

/**
* rotate over its position
* @method rotate
* @param {number} angle in radians
* @param {vec3} axis
*/
Camera.prototype.rotate = function(angle, axis)
{
	var R = quat.setAxisAngle( temp_quat, axis, angle );
	var front = vec3.subtract( temp_vec3, this._target, this._position );
	vec3.transformQuat(front, front, R );
	vec3.add(this._target, this._position, front);
	this._must_update_matrix = true;
}

/**
* rotate over its position
* @method rotateLocal
* @param {number} angle in radians
* @param {vec3} axis in local coordinates
*/
Camera.prototype.rotateLocal = function(angle, axis)
{
	var local_axis = mat4.rotateVec3(temp_vec3b, this._model_matrix, axis);
	var R = quat.setAxisAngle( temp_quat, local_axis, angle );
	var front = vec3.subtract( temp_vec3, this._target, this._position );
	vec3.transformQuat(front, front, R );
	vec3.add(this._target, this._position, front);
	this._must_update_matrix = true;
}

/**
* rotate around its target position
* @method rotate
* @param {number} angle in radians
* @param {vec3} axis
* @param {vec3} [center=null] if another center is provided it rotates around it
*/
Camera.prototype.orbit = function(angle, axis, center, axis_in_local)
{
	if(!axis)
		throw("RD: orbit axis missing");

	center = center || this._target;
	if(axis_in_local)
		axis = mat4.rotateVec3(temp_vec3b, this._model_matrix, axis);
	var R = quat.setAxisAngle( temp_quat, axis, angle );
	var front = vec3.subtract( temp_vec3, this._position, this._target );
	vec3.transformQuat(front, front, R );
	vec3.add(this._position, center, front);
	this._must_update_matrix = true;
}

//multiplies front by f and updates position
Camera.prototype.orbitDistanceFactor = function(f, center)
{
	center = center || this._target;
	var front = vec3.subtract( temp_vec3, this._position, center);
	vec3.scale(front, front,f);
	vec3.add(this._position, center, front);
	this._must_update_matrix = true;
}

/**
* projects a point from 3D to 2D
* @method project
* @param {vec3} vec coordinate to project
* @param {Array} [viewport=gl.viewport]
* @param {vec3} [result=vec3]
* @return {vec3} the projected point
*/
Camera.prototype.project = function( vec, viewport, result )
{
	result = result || vec3.create();
	viewport = viewport || gl.viewport_data;
	if(this._must_update_matrix)
		this.updateMatrices();
	mat4.projectVec3(result, this._viewprojection_matrix, vec );

	//adjust to viewport
	result[0] = result[0] * viewport[2] + viewport[0];
	result[1] = result[1] * viewport[3] + viewport[1];

	return result;
}

/**
* projects a point from 2D to 3D
* @method unproject
* @param {vec3} vec coordinate to unproject
* @param {Array} [viewport=gl.viewport]
* @param {vec3} [result=vec3]
* @return {vec3} the projected point
*/
Camera.prototype.unproject = function( vec, viewport, result )
{
	viewport = viewport || gl.viewport_data;
	if(this._must_update_matrix)
		this.updateMatrices();
	return vec3.unproject( result || vec3.create(), vec, this._viewprojection_matrix, viewport );
}

/**
* gets the ray passing through one pixel
* @method getRay
* @param {number} x
* @param {number} y
* @param {Array} [viewport=gl.viewport]
* @param {Object} [out] { origin: vec3, direction: vec3 }
* @return {Object} ray object { origin: vec3, direction:vec3 }
*/
Camera.prototype.getRay = function( x, y, viewport, out )
{
	if(x === undefined || y === undefined )
		throw("RD.Camera.getRay requires x and y parameters");

	viewport = viewport || gl.viewport_data;

	if(!out)
		out = new RD.Ray();

	if(this._must_update_matrix)
		this.updateMatrices();
	
	var origin = out.origin;
	vec3.set( origin, x,y,0 );
	if(this.type == RD.Camera.ORTHOGRAPHIC)
		vec3.unproject( origin, origin, this._viewprojection_matrix, viewport );
	else
		vec3.copy( origin, this.position );

	var direction = out.direction;
	vec3.set( direction, x,y,1 );
	vec3.unproject( direction, direction, this._viewprojection_matrix, viewport );
	vec3.sub( direction, direction, origin );
	vec3.normalize( direction, direction );
	return out;
}

/**
* given a screen coordinate it cast a ray and returns the collision point with a given plane
* @method getRayPlaneCollision
* @param {number} x
* @param {number} y
* @param {vec3} position Plane point
* @param {vec3} normal Plane normal
* @param {vec3} [result=vec3]
* @param {vec4} [viewport=vec4]
* @return {vec3} the collision point, or null
*/
Camera.prototype.getRayPlaneCollision = function(x,y, position, normal, result, viewport )
{
	result = result || vec3.create();
	//*
	var ray = this.getRay( x, y, viewport );
	if( geo.testRayPlane( ray.origin, ray.direction, position, normal, result ) )
		return result;
	return null;
	/*/
	if(this._must_update_matrix)
		this.updateMatrices();
	var RT = new GL.Raytracer( this._viewprojection_matrix, viewport );
	var start = this._position;
	var dir = RT.getRayForPixel( x,y );
	if( geo.testRayPlane( start, dir, position, normal, result ) )
		return result;
	return null;
	//*/
}

Camera.controller_keys = { forward: "UP", back: "DOWN", left:"LEFT", right:"RIGHT" };

/**
* Used to move the camera (helps during debug)
* @method applyController
* @param {number} dt delta time from update
* @param {Event} e mouse event or keyboard event
*/
Camera.prototype.applyController = function(dt, event, speed)
{
	speed  = speed || 10;
	if(dt)
	{
		if(gl.keys[ Camera.controller_keys.forward ])
			this.moveLocal( vec3.scale(temp_vec3,RD.FRONT,dt * speed) );
		else if(gl.keys[ Camera.controller_keys.back ])
			this.moveLocal( vec3.scale(temp_vec3,RD.BACK,dt * speed) );
		if(gl.keys[ Camera.controller_keys.left ])
			this.moveLocal( vec3.scale(temp_vec3,RD.LEFT,dt * speed) );
		else if(gl.keys[ Camera.controller_keys.right ])
			this.moveLocal( vec3.scale(temp_vec3,RD.RIGHT,dt * speed) );
	}

	if(event)
	{
		if(event.deltax)
			this.rotate( event.deltax * -0.005, RD.UP );
		if(event.deltay)
			this.rotateLocal( event.deltay * -0.005, RD.RIGHT );
	}
}

Camera.prototype.lerp = function(camera, f)
{
	vec3.lerp( this._position, camera._position, f );
	vec3.lerp( this._target, camera._target, f );
	vec3.lerp( this._up, camera._up, f );
	this._fov = this._fov * (1.0 - f) + camera._fov * f;
	this._must_update_matrix = true;
}


Camera.prototype.extractPlanes = function()
{
	var vp = this._viewprojection_matrix;
	var planes = this._planes_data || new Float32Array(4*6);

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

	this._planes_data = planes;
	if(!this._frustrum_planes)
		this._frustrum_planes = [ planes.subarray(0,4),planes.subarray(4,8),planes.subarray(8,12),planes.subarray(12,16),planes.subarray(16,20),planes.subarray(20,24) ];

	function normalize(pos)
	{
		var N = planes.subarray(pos,pos+3);
		var l = vec3.length(N);
		if(!l === 0.0)
			return;
		l = 1.0 / l;
		planes[pos] *= l;
		planes[pos+1] *= l;
		planes[pos+2] *= l;
		planes[pos+3] *= l;
	}
}

var CLIP_INSIDE = RD.CLIP_INSIDE = 0;
var CLIP_OUTSIDE = RD.CLIP_OUTSIDE = 1;
var CLIP_OVERLAP = RD.CLIP_OVERLAP = 2;

/**
* test if box is inside frustrum (you must call camera.extractPlanes() previously to update frustrum planes)
* @method testBox
* @param {vec3} center center of the box
* @param {vec3} halfsize halfsize of the box (vector from center to corner)
* @return {number} CLIP_OUTSIDE or CLIP_INSIDE or CLIP_OVERLAP
*/
Camera.prototype.testBox = function(center, halfsize)
{
	if(!this._frustrum_planes)
		this.extractPlanes();
	var planes = this._frustrum_planes;
	var flag = 0, o = 0;

	flag = planeOverlap( planes[0],center, halfsize);
	if (flag == CLIP_OUTSIDE) return CLIP_OUTSIDE; o+= flag;
	flag =  planeOverlap( planes[1],center, halfsize);
	if (flag == CLIP_OUTSIDE) return CLIP_OUTSIDE; o+= flag;
	flag =  planeOverlap( planes[2],center, halfsize);
	if (flag == CLIP_OUTSIDE) return CLIP_OUTSIDE; o+= flag;
	flag =  planeOverlap( planes[3],center, halfsize);
	if (flag == CLIP_OUTSIDE) return CLIP_OUTSIDE; o+= flag;
	flag =  planeOverlap( planes[4],center, halfsize);
	if (flag == CLIP_OUTSIDE) return CLIP_OUTSIDE; o+= flag;
	flag =  planeOverlap( planes[5],center, halfsize);
	if (flag == CLIP_OUTSIDE) return CLIP_OUTSIDE; o+= flag;

	if (o==0) return CLIP_INSIDE;
	else return CLIP_OVERLAP;
}

/**
* test if sphere is inside frustrum (you must call camera.extractPlanes() previously to update frustrum planes)
* @method testSphere
* @param {vec3} center 
* @param {number} radius
* @return {number} CLIP_OUTSIDE or CLIP_INSIDE or CLIP_OVERLAP
*/
Camera.prototype.testSphere = function(center, radius)
{
	if(!this._frustrum_planes)
		this.extractPlanes();
	var planes = this._frustrum_planes;

	var dist;
	var overlap = false;

	dist = distanceToPlane( planes[0], center );
	if( dist < -radius )
		return CLIP_OUTSIDE;
	else if(dist >= -radius && dist <= radius)
		overlap = true;
	dist = distanceToPlane( planes[1], center );
	if( dist < -radius )
		return CLIP_OUTSIDE;
	else if(dist >= -radius && dist <= radius)
		overlap = true;
	dist = distanceToPlane( planes[2], center );
	if( dist < -radius )
		return CLIP_OUTSIDE;
	else if(dist >= -radius && dist <= radius)
		overlap = true;
	dist = distanceToPlane( planes[3], center );
	if( dist < -radius )
		return CLIP_OUTSIDE;
	else if(dist >= -radius && dist <= radius)
		overlap = true;
	dist = distanceToPlane( planes[4], center );
	if( dist < -radius )
		return CLIP_OUTSIDE;
	else if(dist >= -radius && dist <= radius)
		overlap = true;
	dist = distanceToPlane( planes[5], center );
	if( dist < -radius )
		return CLIP_OUTSIDE;
	else if(dist >= -radius && dist <= radius)
		overlap = true;
	
	if(overlap)
		return CLIP_OVERLAP;
	return CLIP_INSIDE;
}

RD.Factory = function Factory( name, parent, extra_options )
{
	var tpl = RD.Factory.templates[name];
	var node = new RD.SceneNode();
	if(tpl)
		node.configure( tpl );
	if(parent)
		( parent.constructor === RD.Scene ? parent.root : parent ).addChild( node );
	if(extra_options)
		node.configure(extra_options);
	return node;
}

RD.Factory.templates = {
	grid: { mesh:"grid", primitive: GL.LINES, color: [0.5,0.5,0.5,0.5], blend_mode: RD.BLEND_ALPHA },
	mesh: { shader: "phong" },
	sphere: { mesh:"sphere", shader: "phong" },
	floor: { mesh:"planeXZ", scaling: 10, shader: "phong" }
};

/* used functions */

function distanceToPlane(plane, point)
{
	return vec3.dot(plane,point) + plane[3];
}

function planeOverlap( plane, center, halfsize )
{
	var n = plane;//plane.subarray(0,3);
	var d = plane[3];

	var tempx = Math.abs( halfsize[0] * n[0] );
	var tempy = Math.abs( halfsize[1] * n[1] );
	var tempz = Math.abs( halfsize[2] * n[2] );

	var radius = tempx + tempy + tempz;
	var distance = vec3.dot( n, center ) + d;

	if (distance <= - radius)
		return CLIP_OUTSIDE;
	else if (distance <= radius)
		return CLIP_OVERLAP;
	else return CLIP_INSIDE;
}


RD.parseTextConfig = function(text)
{
	var lines = text.split("\n");
	var root = { data: "", children: [] };
	inner(root, 0);

	function inner(parent, depth)
	{
	    var last_line = lines.shift();
	    while (last_line)
	    {
		if(last_line.trim().length == 0)
		{
			last_line = lines.shift();
			continue;
		}
		
		var tabs = 0;
		while( last_line[tabs] == '\t' && tabs < last_line.length )
			tabs++;		
		if (tabs < depth)
		    break;
		
		var node = { children:[] };
		try
		{
			var info = last_line.trim();
			if(info.indexOf(":") != -1)
				info = "{" + info + "}";
			var func = new Function("return " + info);
			node.data = func();
		}
		catch(err)
		{
			console.error(err);
		}
		
		if (tabs >= depth)
		{
		    if (parent)
			parent.children.push(node);
		    last_line = inner(node, tabs+1);
		}
	    }
	    return last_line;
	}
	return root;
}


Renderer.prototype.createShaders = function()
{
	this._flat_shader = new GL.Shader('\
				precision highp float;\
				attribute vec3 a_vertex;\
				uniform mat4 u_mvp;\
				void main() {\
					gl_Position = u_mvp * vec4(a_vertex,1.0);\
					gl_PointSize = 2.0;\
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
		uniform sampler2D u_color_texture;\
		void main() {\
			gl_FragColor = u_color * texture2D(u_color_texture, v_coord);\
		}\
	');
	gl.shaders["texture"] = this._texture_shader;
	
	this._texture_transform_shader = new GL.Shader('\
		precision highp float;\
		attribute vec3 a_vertex;\
		attribute vec2 a_coord;\
		varying vec2 v_coord;\
		uniform mat4 u_mvp;\
		uniform mat3 u_texture_matrix;\
		void main() {\
			v_coord = (u_texture_matrix * vec3(a_coord,1.0)).xy;\
			gl_Position = u_mvp * vec4(a_vertex,1.0);\
			gl_PointSize = 5.0;\
		}\
		', '\
		precision highp float;\
		varying vec2 v_coord;\
		uniform vec4 u_color;\
		uniform float u_global_alpha_clip;\
		uniform sampler2D u_color_texture;\
		void main() {\
			vec4 color = u_color * texture2D(u_color_texture, v_coord);\
			if(color.w < u_global_alpha_clip)\
				discard;\
			gl_FragColor = color;\
		}\
	');
	gl.shaders["texture_transform"] = this._texture_transform_shader;
	
	
	
	//basic phong shader
	var phong_uniforms = { u_ambient: vec3.create(), u_light_vector: vec3.fromValues(0.577, 0.577, 0.577), u_light_color: RD.WHITE };
	
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
			uniform vec3 u_ambient;\
			uniform vec3 u_light_color;\
			uniform vec3 u_light_vector;\
			uniform vec4 u_color;\
			void main() {\
			  vec3 N = normalize(v_normal);\
			  gl_FragColor = u_color * (vec4(u_ambient,1.0) + max(0.0, dot(u_light_vector,N)) * vec4(u_light_color,1.0));\
			}\
		');
	gl.shaders["phong"] = this._phong_shader;
	this._phong_shader._uniforms = phong_uniforms;
	gl.shaders["phong"].uniforms( phong_uniforms );

	//basic phong shader
	this._textured_phong_shader = new GL.Shader('\
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
			uniform vec3 u_lightcolor;\
			uniform vec3 u_lightvector;\
			uniform vec4 u_color;\
			uniform sampler2D u_color_texture;\
			void main() {\
			  vec3 N = normalize(v_normal);\
			  gl_FragColor = u_color * texture2D(u_color_texture, v_coord) * max(0.0, dot(u_lightvector,N)) * vec4(u_lightcolor,1.0);\
			}\
		');
	gl.shaders["textured_phong"] = this._textured_phong_shader;
	gl.shaders["textured_phong"].uniforms( phong_uniforms );
}


/**
* Billboard class to hold an scene item, used for camera aligned objects
* @class Billboard
* @constructor
*/
function Billboard()  
{
	this._ctor();
}

extendClass(Billboard, SceneNode);
RD.Billboard = Billboard;

Billboard.SPHERIC = 1;
Billboard.PARALLEL_SPHERIC = 2;
Billboard.CYLINDRIC = 3;
Billboard.PARALLEL_CYLINDRIC = 4;

Billboard.prototype._ctor = function()
{
	this.billboard_mode = Billboard.SPHERIC;
	this.auto_orient = true;
	SceneNode.prototype._ctor.call(this);
}

Billboard.orientNode = function( node, camera, renderer )
{
	if( node.billboard_mode == Billboard.CYLINDRIC || node.billboard_mode == Billboard.PARALLEL_CYLINDRIC )
	{
		var global_pos = null;
		if(node.billboard_mode == Billboard.CYLINDRIC)
		{
			global_pos = node.getGlobalPosition( temp_vec3b );
			vec3.sub(temp_vec3, camera._position, global_pos);
			temp_vec2[0] = temp_vec3[0];
			temp_vec2[1] = temp_vec3[2];
		}
		else //Billboard.PARALLEL_CYLINDRIC
		{
			temp_vec2[0] = camera._front[0];
			temp_vec2[1] = camera._front[2];
		}

		var angle = vec2.computeSignedAngle( temp_vec2, RD.FRONT2D );
		if( !isNaN(angle) )
		{
			mat4.rotateY( temp_mat4, identity_mat4, -angle );
			node._global_matrix.set( temp_mat4 );
			mat4.setTranslation( node._global_matrix, node._position );
			mat4.scale( node._global_matrix, node._global_matrix, node._scale );
		}
	}
	else
	{
		if(node.billboard_mode == Billboard.PARALLEL_SPHERIC)
		{
			node._global_matrix.set( camera._model_matrix );
			mat4.setTranslation( node._global_matrix, node._position );
			mat4.scale( node._global_matrix, node._global_matrix, node._scale );
		}
		else //Billboard.SPHERIC
		{
			mat4.lookAt( node._global_matrix, node._position, camera.position, RD.UP );
			mat4.invert( node._global_matrix, node._global_matrix );
			mat4.scale( node._global_matrix, node._global_matrix, node._scale );
		}
	}
	
	renderer.setModelMatrix( node._global_matrix );
}

Billboard.prototype.render = function(renderer, camera )
{
	//avoid orienting if it is not visible
	if(this.flags.visible === false)
		return;

	if(this.auto_orient)
		Billboard.orientNode( this, camera, renderer );
	
	renderer.renderNode( this, renderer, camera );
}

/*
Billboard.prototype.faceTo = function( position )
{
	
}
*/



/**
* PointCloud renders an array of points
* @class PointCloud
* @constructor
*/
function PointCloud()  
{
	this._ctor();
	
	this.points = [];
	this.max_points = 1000;
	
	this.draw_range = [0,this.max_points*3];
	this.shader = "pointcloud";
	this.textures = { color: "white" };
	this.blend_mode = RD.BLEND_ALPHA;
	this.flags.depth_write = false;
	this.render_priority = RD.PRIORITY_ALPHA;
	
	this.num_textures = 1; //atlas number of rows and columns

	this.points_size = 100;
	
	this._uniforms = {
			u_pointSize: this.points_size,
			u_texture_info: vec2.fromValues(1,1)
		};
	
	this.primitive = gl.POINTS;
	this._vertices = new Float32Array( this.max_points * 3 );
	this._extra = new Float32Array( this.max_points * 3 );
	
	this._meshes = {}; 

	this._accumulated_time = 0;
	this._last_point_id = 0;
}

extendClass(PointCloud, SceneNode);
RD.PointCloud = PointCloud;

PointCloud.prototype.render = function(renderer, camera )
{
	if(this.points.length == 0)
		return;
	
	this.updateVertices();
	
	//we can have several meshes if we have more than one context
	var mesh = this._meshes[ renderer.gl.context_id ];
	
	if(!mesh)
	{
		mesh = new GL.Mesh( undefined,undefined, renderer.gl );
		this._vertices_buffer = mesh.createVertexBuffer("vertices", null, 3, this._vertices, gl.DYNAMIC_DRAW );
		this._extra_buffer = mesh.createVertexBuffer("extra3", null, 3, this._extra, gl.DYNAMIC_DRAW );
	}
	this._mesh = mesh;
	
	
	this._vertices_buffer.uploadRange(0, this.points.length * 3 * 4); //4 bytes per float
	this._extra_buffer.uploadRange(0, this.points.length * 3 * 4); //4 bytes per float
	
	var shader = gl.shaders[ this.shader ];
	if(!shader)
	{
		shader = gl.shaders["pointcloud"];
		if(!shader)
			gl.shaders["pointcloud"] = new GL.Shader( PointCloud._vertex_shader, PointCloud._pixel_shader );
	}
	
	this.draw_range[1] = this.points.length;
	var viewport = gl.getViewport();
	this._uniforms.u_pointSize = this.points_size / (gl.canvas.width / viewport[2]);
	this._uniforms.u_color = this.color;
	this._uniforms.u_texture_info[0] = 1 / this.num_textures;
	this._uniforms.u_texture_info[1] = this.num_textures * this.num_textures;
	
	if(this.ignore_transform)
	{
		mat4.identity( renderer._model_matrix );
		renderer._mvp_matrix.set( renderer._viewprojection_matrix );
	}
	renderer.renderNode( this, renderer, camera );
}

PointCloud.prototype.updateVertices = function(mesh)
{
	//update mesh
	var l = this.points.length;
	if(!l)
		return;
	var vertices = this._vertices;
	var extra = this._extra;
	var pos = 0;
	var num_textures2 = this.num_textures * this.num_textures;
	for(var i = 0; i < l; i++)
	{
		var p = this.points[i];
		vertices.set( p.pos, pos );
		extra[pos] = 1;
		extra[pos+1] = 1;
		if(num_textures2 > 1)
			extra[pos+2] = p.tex;
		pos+=3;
	}
}

PointCloud._vertex_shader = '\
			precision highp float;\
			attribute vec3 a_vertex;\
			attribute vec3 a_extra3;\
			varying vec2 v_coord;\
			varying vec4 v_color;\
			varying vec3 v_position;\
			uniform vec3 u_camera_position;\
			uniform mat4 u_mvp;\
			uniform mat4 u_model;\
			uniform vec4 u_color;\
			uniform float u_pointSize;\
			uniform vec2 u_texture_info;\
			void main() {\n\
				v_color = u_color;\n\
				v_color.a *= a_extra3.y;\n\
				v_coord.x = (a_extra3.z * u_texture_info.y) * u_texture_info.x;\n\
				v_coord.y = abs(floor(v_coord.x) * u_texture_info.x);\n\
				v_coord.x = fract(v_coord.x);\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
				v_position = (u_model * vec4(a_vertex,1.0)).xyz;\n\
				float dist = distance( u_camera_position, v_position );\n\
				gl_PointSize = 10.0 * u_pointSize / dist;\n\
			}\
			';
PointCloud._pixel_shader = '\
			precision highp float;\
			varying vec4 v_color;\
			varying vec2 v_coord;\
			varying vec3 v_position;\
			uniform sampler2D u_color_texture;\
			uniform vec2 u_texture_info;\
			void main() {\
			  vec2 uv = vec2(v_coord.x + gl_PointCoord.x * u_texture_info.x, v_coord.y + (1.0 - gl_PointCoord.y) * u_texture_info.x );\n\
			  vec4 color = texture2D( u_color_texture, uv );\n\
			  color.xyz *= v_color.xyz;\n\
			  #ifdef USE_PROCESS_COLOR\n\
				USE_PROCESS_COLOR\n\
			  #endif\n\
			  gl_FragColor = vec4( color.xyz, color.a * v_color.a );\n\
			}\
		';




/**
* ParticlesEmissor renders points and animate them as particles
* @class ParticlesEmissor
* @constructor
*/
function ParticlesEmissor()  
{
	this._ctor();
	
	this.particles = [];
	this.max_particles = 1000;
	
	this.draw_range = [0,this.max_particles*3];
	this.shader = "particles";
	this.textures = { color: "white" };
	this.blend_mode = RD.BLEND_ALPHA;
	this.flags.depth_write = false;
	this.render_priority = RD.PRIORITY_ALPHA;
	
	this.num_textures = 1; //atlas number of rows and columns

	this.particles_size = 100;
	this.particles_per_second = 5;
	this.particles_life = 5;
	this.particles_damping = 0.5;
	this.particles_acceleration = vec3.create(); //use it for gravity and stuff
	this.particles_start_scale = 1;
	this.particles_end_scale = 1;
	this.velocity_variation = 1;
	this.emissor_direction = vec3.fromValues(0,1,0);
	
	this._uniforms = {
			u_pointSize: this.particle_size,
			u_scaleStartEnd: vec2.fromValues(1,1),
			u_texture_info: vec2.fromValues(1,1)
		};
	
	this.primitive = gl.POINTS;
	this._vertices = new Float32Array( this.max_particles * 3 );
	this._extra = new Float32Array( this.max_particles * 3 );
	
	this._meshes = {};
	
	this._accumulated_time = 0;
	this._last_particle_id = 0;
}

extendClass(ParticlesEmissor, SceneNode);
RD.ParticlesEmissor = ParticlesEmissor;

ParticlesEmissor.prototype.update = function(dt)
{
	var l = this.particles.length;
	var damping = this.particles_damping;
	var acc = this.particles_acceleration;
	var forces = vec3.length(acc);
	if(l)
	{
		//update every particle alive (remove the dead ones)
		var alive = [];
		for(var i = 0; i < l; i++)
		{
			var p = this.particles[i];
			vec3.scaleAndAdd( p.pos, p.pos, p.vel, dt );
			if(forces)
				vec3.scaleAndAdd( p.vel, p.vel, acc, dt );
			if(damping)
				vec3.scaleAndAdd( p.vel, p.vel, p.vel, -dt * damping );
			p.ttl -= dt;
			if(p.ttl > 0)
				alive.push(p);
		}
		this.particles = alive;
	}

	//Create new ones	
	var pos = this.getGlobalPosition();
	var vel = this.emissor_direction;
	var life = this.particles_life;
	var num_textures2 = this.num_textures * this.num_textures;
	var velocity_variation = this.velocity_variation;
	
	if(this.particles_per_second > 0)
	{
		var particles_to_create = this.particles_per_second * (dt + this._accumulated_time);
		this._accumulated_time = (particles_to_create - Math.floor( particles_to_create )) / this.particles_per_second;
		particles_to_create = Math.floor( particles_to_create );
		for(var i = 0; i < particles_to_create; i++)
		{
			if(this.particles.length >= this.max_particles)
				break;
			var vel = vec3.clone(vel);
			vel[0] += Math.random() * 0.5 * velocity_variation;
			vel[2] += Math.random() * 0.5 * velocity_variation;
			this.particles.push({id: this._last_particle_id++, tex: Math.floor(Math.random() * num_textures2) / num_textures2, pos: vec3.clone(pos), vel: vel, ttl: life});
		}
	}
}

ParticlesEmissor.prototype.render = function(renderer, camera )
{
	if(this.particles.length == 0)
		return;
	
	this.updateVertices();
	
	//we can have several meshes if we have more than one context
	var mesh = this._meshes[ renderer.gl.context_id ];
	
	if(!mesh)
	{
		mesh = new GL.Mesh( undefined,undefined, renderer.gl );
		this._vertices_buffer = mesh.createVertexBuffer("vertices", null, 3, this._vertices, gl.DYNAMIC_DRAW );
		this._extra_buffer = mesh.createVertexBuffer("extra3", null, 3, this._extra, gl.DYNAMIC_DRAW );
	}
	this._mesh = mesh;	
	
	this._vertices_buffer.uploadRange(0, this.particles.length * 3 * 4); //4 bytes per float
	this._extra_buffer.uploadRange(0, this.particles.length * 3 * 4); //4 bytes per float
	
	var shader = gl.shaders[ this.shader ];
	if(!shader)
	{
		shader = gl.shaders["particles"];
		if(!shader)
			gl.shaders["particles"] = new GL.Shader(ParticlesEmissor._vertex_shader, ParticlesEmissor._pixel_shader);
	}
	
	this.draw_range[1] = this.particles.length;
	var viewport = gl.getViewport();
	this._uniforms.u_pointSize = this.particles_size / (gl.canvas.width / viewport[2]);
	this._uniforms.u_color = this.color;
	this._uniforms.u_texture_info[0] = 1 / this.num_textures;
	this._uniforms.u_texture_info[1] = this.num_textures * this.num_textures;
	this._uniforms.u_scaleStartEnd[0] = this.particles_start_scale;
	this._uniforms.u_scaleStartEnd[1] = this.particles_end_scale;
	mat4.identity( renderer._model_matrix );
	renderer._mvp_matrix.set( renderer._viewprojection_matrix );
	renderer.renderNode( this, renderer, camera );
}

ParticlesEmissor.prototype.updateVertices = function(mesh)
{
	//update mesh
	var l = this.particles.length;
	if(!l)
		return;
	var vertices = this._vertices;
	var extra = this._extra;
	var pos = 0;
	var life = this.particles_life;
	var num_textures2 = this.num_textures * this.num_textures;
	for(var i = 0; i < l; i++)
	{
		var p = this.particles[i];
		vertices.set( p.pos, pos );
		extra[pos] = 1;
		extra[pos+1] = p.ttl / life;
		if(num_textures2 > 1)
			extra[pos+2] = p.tex;
		pos+=3;
	}
}

ParticlesEmissor._vertex_shader = '\
			precision highp float;\
			attribute vec3 a_vertex;\
			attribute vec3 a_extra3;\
			varying vec2 v_coord;\
			varying vec4 v_color;\
			varying vec3 v_position;\
			uniform vec3 u_camera_position;\
			uniform mat4 u_mvp;\
			uniform mat4 u_model;\
			uniform vec4 u_color;\
			uniform float u_pointSize;\
			uniform vec2 u_texture_info;\
			uniform vec2 u_scaleStartEnd;\
			void main() {\n\
				v_color = u_color;\n\
				v_color.a *= a_extra3.y;\n\
				v_coord.x = (a_extra3.z * u_texture_info.y) * u_texture_info.x;\n\
				v_coord.y = floor(v_coord.x) * u_texture_info.x;\n\
				v_coord.x = fract(v_coord.x);\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
				v_position = (u_model * vec4(a_vertex,1.0)).xyz;\n\
				float dist = distance( u_camera_position, v_position );\n\
				gl_PointSize = mix(u_scaleStartEnd.y, u_scaleStartEnd.x, a_extra3.y) * 10.0 * u_pointSize / dist;\n\
			}\
			';
ParticlesEmissor._pixel_shader = '\
			precision highp float;\
			varying vec4 v_color;\
			varying vec2 v_coord;\
			varying vec3 v_position;\
			uniform sampler2D u_color_texture;\
			uniform vec2 u_texture_info;\
			void main() {\
			  vec4 color = texture2D( u_color_texture, v_coord + vec2(gl_PointCoord.x,1.0 - gl_PointCoord.y) * u_texture_info.x );\n\
			  color.xyz *= v_color.xyz;\n\
			  #ifdef USE_PROCESS_COLOR\n\
				USE_PROCESS_COLOR\n\
			  #endif\n\
			  gl_FragColor = vec4( color.xyz, color.a * v_color.a );\n\
			}\
		';







//footer

})( typeof(window) != "undefined" ? window : (typeof(self) != "undefined" ? self : global ) );

