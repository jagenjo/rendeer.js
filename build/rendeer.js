//packer version
//packer version
//Rendeer.js lightweight scene container by Javi Agenjo (javi.agenjo@gmail.com) 2014

//main namespace
;(function(global){

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
RD.ONES4 = vec4.fromValues(1,1,1,1);

RD.CENTER = 0;
RD.TOP_LEFT = 1;
RD.TOP_RIGHT = 2;
RD.BOTTOM_LEFT = 3;
RD.BOTTOM_RIGHT = 4;
RD.TOP_CENTER = 5;
RD.BOTTOM_CENTER = 6;

//higher means render before
RD.PRIORITY_BACKGROUND = 30;
RD.PRIORITY_OPAQUE = 20;
RD.PRIORITY_ALPHA = 10;
RD.PRIORITY_HUD = 0;

RD.BLEND_NONE = 0;
RD.BLEND_ALPHA = 1; //src_alpha, one_minus_src_alpha
RD.BLEND_ADD = 2; //src_alpha, one
RD.BLEND_MULTIPLY = 3; //GL.DST_COLOR, GL.ONE_MINUS_SRC_ALPHA

RD.NO_BILLBOARD = 0;
RD.BILLBOARD_SPHERIC = 1;
RD.BILLBOARD_PARALLEL_SPHERIC = 2;
RD.BILLBOARD_CYLINDRIC = 3;
RD.BILLBOARD_PARALLEL_CYLINDRIC = 4;

//data types (used in animation tracks)
RD.UNKNOWN = 0;
RD.NUMBER = RD.SCALAR = 1;
RD.VEC2 = 2;
RD.VEC3 = 3;
RD.VEC4 = 4;
RD.QUAT = 5;
RD.MAT3 = 6;
RD.TRANS10 = 7;
RD.MAT4 = 8;

RD.TYPES = { "NUMBER":RD.NUMBER, "SCALAR":RD.NUMBER, "VEC2":RD.VEC2, "VEC3":RD.VEC3, "VEC4":RD.VEC4, "QUAT":RD.QUAT, "MAT3":RD.MAT3, "TRANS10":RD.TRANS10, "MAT4":RD.MAT4 };
RD.TYPES_SIZE = [0,1,2,3,4,4,9,10,16];

RD.NO_INTERPOLATION = 0;
RD.LINEAR = 1;
RD.CUBIC = 2;

var DEG2RAD = RD.DEG2RAD = 0.0174532925;
var RAD2DEG = RD.RAD2DEG = 57.295779578552306;

//Global Containers (other containers are added from other scripts)
RD.Materials = {};
RD.Images = {}; //used for GLTFs embeded images

RD.setup = function(o)
{
	o = o || {};
	if(RD.configuration)
		throw("already called setup");
	RD.configuration = o;
}

var last_object_id = 0;

if( typeof(extendClass) == "undefined" )
{
	global.extendClass = function extendClass( target, origin ) {
		for(var i in origin) //copy class properties
		{
			if(target.hasOwnProperty(i))
				continue;
			target[i] = origin[i];
		}

		if(origin.prototype) //copy prototype properties
		{
			var prop_names = Object.getOwnPropertyNames( origin.prototype );
			for(var i = 0; i < prop_names.length; ++i) //only enumerables
			{
				var name = prop_names[i];
				//if(!origin.prototype.hasOwnProperty(name)) 
				//	continue;

				if(target.prototype.hasOwnProperty(name)) //avoid overwritting existing ones
					continue;

				//copy getters 
				if(origin.prototype.__lookupGetter__(name))
					target.prototype.__defineGetter__(name, origin.prototype.__lookupGetter__(name));
				else 
					target.prototype[name] = origin.prototype[name];

				//and setters
				if(origin.prototype.__lookupSetter__(name))
					target.prototype.__defineSetter__(name, origin.prototype.__lookupSetter__(name));
			}
		}

		if(!target.hasOwnProperty("superclass")) 
			Object.defineProperty(target, "superclass", {
				get: function() { return origin },
				enumerable: false
			});	
	}
}


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
	this._transform = new Float32Array(10);
	this._position = this._transform.subarray(0,3);
	this._rotation = this._transform.subarray(3,7);
	this._scale = this._transform.subarray(7,10);
	quat.identity( this._rotation );
	this._scale.set( RD.ONE );
	
	this._local_matrix = mat4.create();
	this._global_matrix = mat4.create(); //in global space
	this._must_update_matrix = false;

	//watchers
	//TO DO: use Proxy

	//bounding box in world space
	this.bounding_box = null; //use updateBoundingBox to update it

	//rendering priority (order) bigger means earlier
	this.render_priority = RD.PRIORITY_OPAQUE;

	this.layers = 0x3|0; //first two layers

	this.draw_range = null;
	this._instances = null; //array of mat4 with the model for every instance

	this.primitive = GL.TRIANGLES;

	this.primitives = []; //in case this object has multimaterial this will contain { index: submesh index, material: material name, mode: render primitive };

	//assets
	this.mesh = null;
	
	this.textures = {};
	this.shader = null;

	//could be used for many things
	this.blend_mode = RD.BLEND_NONE;
	this._color = vec4.fromValues(1,1,1,1);

	//in case it uses materials
	this.material = null;

	//overwrite callbacks
	if(!this.onRender)
		this.onRender = null;
	if(!this.onShaderUniforms)
		this.onShaderUniforms = null;

	this.flags = {
		visible: true,
		collides: true //for testRay
	};

	//object inside this object
	this.children = [];

	this._uniforms = { u_color: this._color, u_color_texture: 0 };
}

SceneNode.ctor = SceneNode.prototype._ctor; //helper

/*
SceneNode.prototype.super = function(class_name)
{
	
}
*/

SceneNode.prototype.clone = function(depth)
{
	var o = new this.constructor();
	for(var i in this)
	{
		if(i[0] == "_") //private
			continue;
		//if(this.__lookupGetter__(i)) //its a getter
		//	continue;
		if(i == "children") //never copy this
		{
			if(depth)
			for(var j = 0; j < this.children.length; ++j)
				o.addChild( this.children[j].clone(depth) );
			continue;
		}
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

/**
* An array containing [x,y,z, rotx,roty,rotz,rotw,  sx, sy, sz]
* @property transform {vec3}
*/
Object.defineProperty(SceneNode.prototype, 'transform', {
	get: function() { return this._transform; },
	set: function(v) { 
		this._transform.set(v);
		this._must_update_matrix = true; },
	enumerable: true
});

Object.defineProperty(SceneNode.prototype, 'matrix', {
	get: function() { return this._model_matrix; },
	set: function(v) { 
		this.fromMatrix( v );
	},
	enumerable: false
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
Object.defineProperty( SceneNode.prototype, 'color', {
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

	if(!this.children)
		this.children = [];

	this.children.push(node);

	if( this._scene != node._scene )
		change_scene(node, this._scene);

	//recursive change all children scene pointer
	function change_scene(node, scene)
	{
		if(node._scene && node._scene != scene)
		{
			var index = node._scene._nodes.indexOf(node);
			if(index != -1)
				node._scene._nodes.splice(index,1);
			if(node.id && node._scene._nodes_by_id[node.id] == node)
				delete node._scene._nodes_by_id[node.id];
		}
		node._scene = scene;
		if(scene)
		{
			scene._nodes.push(node);
			if(node.id && scene)
				scene._nodes_by_id[node.id] = node;
		}
		if(node.children)
			for(var i = 0, l = node.children.length; i < l; i++)
			{
				var child = node.children[i];
				if( child._scene != scene )
					change_scene( child, scene );
			}
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

	if(!this.children)
		return;

	var pos = this.children.indexOf(node);
	if(pos == -1)
		throw("removeChild: impossible, should be children");

	this.children.splice(pos,1);
	node._parent = null;
	if( keep_transform )
		node.fromMatrix( node._global_matrix );

	change_scene( node );

	//recursive change all children
	function change_scene( node )
	{
		if( node._scene )
		{
			if( node.id && node._scene._nodes_by_id[node.id] == node )
				delete node._scene._nodes_by_id[ node.id ];
			var index = node._scene._nodes.indexOf(node);
			if(index != -1)
				node._scene._nodes.splice(index,1);
		}
		node._scene = null;
		for(var i = 0, l = node.children.length; i < l; i++)
			change_scene( node.children[i] );
	}
}

SceneNode.prototype.removeAllChildren = function()
{
	if(!this.children)
		return;

	while(this.children.length)
		this.removeChild( this.children[0] );
}

/**
* Remove all childs
* @method clear
*/
SceneNode.prototype.clear = function()
{
	if(!this.children)
		return;

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
	if(!this.children)
		return;

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

	if(!this.children)
		return r;

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
SceneNode.prototype.getVisibleChildren = function( result, layers, layers_affect_children )
{
	result = result || [];
	if(layers === undefined)
		layers = 0xFFFF;

	if(!this.children)
		return result;

	if(this.flags.visible === false)
		return result;

	for(var i = 0, l = this.children.length; i < l; i++)
	{
		var node = this.children[i];
		var visible = node.layers & layers;
		if(layers_affect_children && !visible)
			continue;
		if(visible)
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
		children: [],
	};

	if(this.name)
		r.name = this.name;
	if(this.primitives && this.primitives.length)
		r.primitives = this.primitives.concat();
	if(this.mesh)
		r.mesh = this.mesh;
	if(this.material)
		r.material = this.material;
	if(this.submesh != null)
		r.submesh = this.submesh;
	if(this.flags)
		r.flags = JSON.parse( JSON.stringify( this.flags ) );
	if(this.extra)
		r.extra = this.extra;
	if(this.animation)
		r.animation = this.animation;

	if(this.onSerialize)
		this.onSerialize(r);

	if(this.children)
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
			case "flags":
				for(var j in o.flags)
					this.flags[j] = o.flags[j];
				continue;
			case "scale":
			case "scaling":
				this.scale(o[i]);
				continue;
			case "tiling":
				if( isNumber( o[i] ) )
					this.setTextureTiling(o[i],o[i]);
				else
					this.setTextureTiling(o[i][0],o[i][1],o[i][2],o[i][3]);
				continue;
			case "name":
			case "mesh":
			case "primitives":
			case "material":
			case "ref":
			case "draw_range":
			case "submesh":
			case "animation":
				this[i] = o[i];
				continue;
			case "parent":
				parent = o[i];
				break;
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
		this.removeAllChildren();
		for(var i = 0; i < o.children.length; ++i)
		{
			var child = new RD.SceneNode();
			child.configure( o.children[i] );
			this.addChild(child);
		}
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
* @param {Boolean} local [optional] if true it will rotate the vector according to its rotation
*/
SceneNode.prototype.translate = function( delta, local )
{
	if(local)
		this.getLocalVector( delta, temp_vec3 );
	else
		temp_vec3.set(delta);
	vec3.add( this._position, this._position, temp_vec3 );
	this._must_update_matrix = true;
}

SceneNode.prototype.move = SceneNode.prototype.translate;
SceneNode.prototype.moveLocal = function( delta )
{
	this.translate(delta, true);
}

/**
* Rotate object (supports local or global but doesnt takes into account parent)
* @method rotate
* @param {number} angle_in_rad
* @param {vec3} axis
* @param {boolean} in_local specify if the axis is in local space or global space
*/
SceneNode.prototype.rotate = function( angle_in_rad, axis, in_local )
{
	quat.setAxisAngle( temp_quat, axis, angle_in_rad );
	
	if(!in_local)
		quat.multiply( this._rotation, this._rotation, temp_quat );
	else
		quat.multiply( this._rotation, temp_quat, this._rotation );
	this._must_update_matrix = true;
}

/**
* Changes the rotation using euler angles
* @method rotate
* @param {Array} eule_angles [yaw,pitch,roll] in radians
*/
SceneNode.prototype.setRotationFromEuler = function( euler )
{
	quat.fromEuler( this._rotation, euler );
	this._must_update_matrix = true;
}

/**
* Rotate object passing a quaternion containing a rotation
* @method rotateQuat
* @param {quat} q
*/
SceneNode.prototype.rotateQuat = function(q, in_local)
{
	if(!in_local)
		quat.multiply( this._rotation, this._rotation, q );
	else
		quat.multiply( this._rotation, q, this._rotation );
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
* Places node in position, looking in the target direction, 
* @method lookAt
* @param {vec3} position where to place the node (in local coords)
* @param {vec3} target where to look at
* @param {vec3} up [optional] the up vector
* @param {boolean} reverse [optional] if true if will look the opposite way 
*/
SceneNode.prototype.lookAt = function( position, target, up, reverse )
{
	this.position = position;
	this.orientTo( target, reverse, up );
}

/**
* Rotate object to face in one direction
* @method orientTo
* @param {vec3} v
*/
SceneNode.prototype.orientTo = function( v, reverse, up )
{
	var pos = this.getGlobalPosition();
	//build unitary vectors
	var front = vec3.sub( vec3.create(), pos, v );
	up = up || RD.UP;
	vec3.normalize( front, front );
	if( reverse )
		vec3.scale( front, front, -1 );
	var temp = mat3.create();
	var right = vec3.cross( vec3.create(), up, front );
	vec3.normalize( right, right );
	var top = vec3.cross( vec3.create(), front, right );
	vec3.normalize( top, top );
	//build mat3
	mat3.setColumn( temp, right, 0 );
	mat3.setColumn( temp, top, 1 );
	mat3.setColumn( temp, front, 2 );
	//convert to quat
	//quat.fromMat3AndQuat( this._rotation, temp );
	quat.fromMat3( this._rotation, temp );
	quat.normalize(this._rotation, this._rotation );
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

SceneNode.prototype.setTextureTiling = function( tiling_x, tiling_y, offset_x, offset_y )
{
	if(!this.texture_matrix)
	{
		this.texture_matrix = mat3.create();
		this._uniforms["u_texture_matrix"] = this.texture_matrix;
	}

	offset_x = offset_x || 0;
	offset_y = offset_y || 0;

	if(!this.shader)
		this.shader = "texture_transform";

	mat3.identity( this.texture_matrix );
	mat3.translate( this.texture_matrix, this.texture_matrix, [offset_x,offset_y] );
	mat3.scale( this.texture_matrix, this.texture_matrix, [tiling_x,tiling_y] );
}

/**
* Get transform local matrix
* @method getLocalMatrix
* @param {mat4} out [optional] where to copy the result, otherwise it is returned the property matrix
* @return {mat4} matrix44 
*/
SceneNode.prototype.getLocalMatrix = function(out)
{
	if(this._must_update_matrix)
		this.updateLocalMatrix();
	if(out)
	{
		out.set(this._global_matrix);
		return out;
	}
	return this._local_matrix;
}

/**
* Get transform global matrix (concatenating parents) (its a reference)
* @method getGlobalMatrix
* @param {mat4} out [optional] where to copy the result, otherwise it is returned the property matrix
* @return {mat4} matrix44 
*/
SceneNode.prototype.getGlobalMatrix = function(out)
{
	this.updateGlobalMatrix();
	if(out)
	{
		out.set(this._global_matrix);
		return out;
	}
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
	result = result || vec4.create();
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

	if(this._parent && this._parent._transform && this._parent.flags.no_transform !== true)
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
	if(is_global && this._parent && this._parent._transform ) //&& this._parent != this.
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

	//removes scale, but is not necessary
	//mat4.scale( M, M, [1/this._scale[0],1/this._scale[1],1/this._scale[2]] );

	//rot
	//quat.fromMat4(this._rotation, M);
	var M3 = mat3.fromMat4( temp_mat3, M );
	quat.fromMat3AndQuat( this._rotation, M3 );
	/*
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

	if(!this._parent || !this._parent._transform)
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


SceneNode.prototype.globalToLocal = function(v,result)
{
	result = result || vec3.create();
	var m = this.getGlobalMatrix();
	mat4.invert(temp_mat4,m);
	return vec3.transformMat4(result, v, temp_mat4 );
}

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
* Searchs the node and returns the first child node with the matching name, it is a recursive search so it is slow
* @method findNodeByName
* @param {string} name the name of the node
* @return {SceneNode} result node otherwise null
*/
SceneNode.prototype.findNodeByName = function(name)
{
	if(name == null)
		return null;

	for(var i = 0, l = this.children.length; i < l; i++)
	{
		var node = this.children[i];
		if( node.name == name )
			return node;
		var r = node.findNodeByName(name);
		if(r)
			return r;
	}
	return null;
}

/**
* Searchs which nodes pass the filter function
* @method findNodesByFilter
* @param {Function} filter_func a function that receives the node and must return true if it passes
* @param {Number} layers [optional] bitmask to filter by layers too
* @param {Array} result [optional] where to store the output
* @return {Array} array with all the nodes that passed the function
*/
SceneNode.prototype.findNodesByFilter = function( filter_func, layers, result )
{
	if(layers === undefined)
		layers = 0xFFFF;
	result = result || [];

	for(var i = 0, l = this.children.length; i < l; i++)
	{
		var node = this.children[i];
		if( !(node.layer & layers) )
			continue;

		if( !filter_func || filter_func( node ) )
			result.push( node );

		node.findNodesByFilter( filter_func, layers, result );
	}
	return result;
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
* @param { Number } layers the layers bitmask where you want to test
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

	return function( ray, result, max_dist, layers, test_against_mesh, test_primitives )
	{
		max_dist = max_dist === undefined ? Number.MAX_VALUE : max_dist;
		if(layers === undefined)
			layers = 0xFFFF;
		result = result || vec3.create();

		if(Scene._ray_tested_objects !== undefined)
			Scene._ray_tested_objects++;
		var node = null;

		//how to optimize: (now it checks randomly based on order in scene graph)
		//	sort nodes by BB center distance to camera
		//	raytest starting from closer

		//test with this node mesh 
		var collided = null;

		if(this.flags.visible === false)
			return null;

		if( (this.layers & layers) && !this.flags.ignore_collisions )
		{
			if( this.mesh )
				collided = this.testRayWithMesh( ray, collision_point, max_dist, layers, test_against_mesh, test_primitives );
		}

		//update closest point if there was a collision
		if(collided)
		{
			var distance = vec3.distance( ray.origin, collision_point );
			if( max_dist == null || distance < max_dist)
			{
				max_dist = distance;
				result.set( collision_point );
				node = this;
			}
		}

		//if no children, then return current collision
		if( !this.children || !this.children.length )
			return node;

		//cannot externalize
		var local_result = vec3.create();

		//test against children
		for(var i = 0 ; i < this.children.length; ++ i )
		{
			var child = this.children[i];
			var child_collided = child.testRay( ray, local_result, max_dist, layers, test_against_mesh );
			if(!child_collided)
				continue;
			var distance = vec3.distance( ray.origin, local_result );
			if( distance < max_dist )
			{
				max_dist = distance;
				result.set( local_result );
				node = child_collided;
			}
		}
		
		return node;
	}
})();

var last_ray_distance = -1;

/**
* Tests if the ray collides with the mesh in this node
* @method testRayWithMesh
* @param { GL.Ray } ray the object containing origin and direction of the ray
* @param { vec3 } coll_point where to store the collision point
* @param { Number } max_dist the max distance of the ray
* @param { Number } layers the layers where you want to test
* @param { Boolean } test_against_mesh if true it will test collision with mesh, otherwise only bounding
* @return { Boolean } true if it collided
*/
SceneNode.prototype.testRayWithMesh = (function(){ 
	var origin = vec3.create();
	var direction = vec3.create();
	var end = vec3.create();
	var inv = mat4.create();

	return function( ray, coll_point, max_dist, layers, test_against_mesh, test_primitives )
	{
		if( !this.mesh )
			return false;

		var mesh = gl.meshes[ this.mesh ];
		if( !mesh || mesh.ready === false) //mesh not loaded
			return false;

		var group_index = this.submesh == null ? -1 : this.submesh;

		//ray to local
		var model = this._global_matrix;
		mat4.invert( inv, model );
		vec3.transformMat4( origin, ray.origin, inv );
		vec3.add( end, ray.origin, ray.direction );
		vec3.transformMat4( end, end, inv );
		vec3.sub( direction, end, origin );
		vec3.normalize( direction, direction );

		if( this.primitives && test_primitives )
		{
			for(var i = 0; i < this.primitives.length; ++i)
			{
				var info = this.primitives[i];
				var test = RD.testRayMesh( ray, origin, direction, mesh, info.index, coll_point, max_dist, layers, test_against_mesh, true );
				//TODO!
			}
		}
		else
			return RD.testRayMesh( ray, origin, direction, model, mesh, group_index, coll_point, max_dist, layers, test_against_mesh, this.flags.two_sided );
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
* returns an array of nodes which center is inside the sphere
* @method findNodesInSphere
* @param {number} layers [optional] bitmask to filter by layer, otherwise 0xFFFF is used
*/
SceneNode.prototype.findNodesInSphere = function( center, radius, layers, out )
{
	if(layers === undefined)
		layers = 0xFFFF;
	out = out || [];
	for(var i = 0; i < this.children.length; ++i)
	{
		var node = this.children[i];
		if( node.layers & layers )
		{
			node.getGlobalPosition( temp_vec3, true );
			var dist = vec3.distance( temp_vec3, center );
			if( dist <= radius ) 
				out.push( node );
		}
		if(node.children.length)
			node.findNodesInSphere( center, radius, layers, out );
	}
	return out;
}

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
	this._near = 0.1;
	/**
	* far distance 
	* @property far {number} 
	* @default 10000
	*/
	this._far = 10000;
	/**
	* aspect (width / height)
	* @property aspect {number} 
	* @default 1
	*/
	this._aspect = 1.0;
	/**
	* fov angle in degrees
	* @property fov {number}
	* @default 45
	*/
	this._fov = 45; //persp
	/**
	* size of frustrum when working in orthographic (could be also an array with [left,right,top,bottom]
	* @property frustum_size {number} 
	* @default 50
	*/
	this._frustum_size = 50; //ortho (could be also an array with [left,right,top,bottom]
	this.flip_y = false;

	//if set to [w,h] of the screen (or framebuffer) it will align the viewmatrix to the texel if it is in orthographic mode
	//useful for shadowmaps in directional lights
	this.view_texel_grid = null;

	this._view_matrix = mat4.create();
	this._projection_matrix = mat4.create();
	this._viewprojection_matrix = mat4.create();
	this._model_matrix = mat4.create(); //inverse of view
	
	this._autoupdate_matrices = true;
	this._must_update_matrix = false;

	this._top = vec3.create();
	this._right = vec3.create();
	this._front = vec3.create();

	this.uniforms = {
		u_view_matrix: this._view_matrix,
		u_projection_matrix: this._projection_matrix,
		u_viewprojection_matrix: this._viewprojection_matrix,
		u_camera_front: this._front,
		u_camera_position: this._position,
		u_camera_planes: vec2.fromValues(0.1,1000),
	};

	if(options)
		this.configure( options );

	this.updateMatrices();
}

RD.Camera = Camera;

Camera.PERSPECTIVE = 1;
Camera.ORTHOGRAPHIC = 2;

Camera.prototype.configure = function(o)
{
	if(o.type != null) this.type = o.type;
	if(o.position) this._position.set(o.position);
	if(o.target) this._target.set(o.target);
	if(o.up) this._up.set(o.up);
	if(o.near) this.near = o.near;
	if(o.far) this.far = o.far;
	if(o.fov) this.fov = o.fov;
	if(o.aspect) this.aspect = o.aspect;
}

Camera.prototype.serialize = function()
{
	var o = {
		type: this.type,
		position: [ this.position[0],this.position[1],this.position[2] ],
		target: [ this.target[0],this.target[1],this.target[2] ],
		up: this.up,
		fov: this.fov,
		near: this.near,
		far: this.far,
		aspect: this.aspect
	};
	return o;
}


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

Object.defineProperty(Camera.prototype, 'fov', {
	get: function() { return this._fov; },
	set: function(v) { this._fov = v; this._must_update_matrix = true; },
	enumerable: false //avoid problems
});

Object.defineProperty(Camera.prototype, 'aspect', {
	get: function() { return this._aspect; },
	set: function(v) { this._aspect = v; this._must_update_matrix = true; },
	enumerable: false //avoid problems
});

//(could be also an array with [left,right,top,bottom]
Object.defineProperty(Camera.prototype, 'frustum_size', {
	get: function() { return this._frustum_size; },
	set: function(v) { this._frustum_size = v; this._must_update_matrix = true; },
	enumerable: false //avoid problems
});

Object.defineProperty(Camera.prototype, 'near', {
	get: function() { return this._near; },
	set: function(v) { 
		this._near = this.uniforms.u_camera_planes[0] = v; 
		this._must_update_matrix = true;
	},
	enumerable: false //avoid problems
});

Object.defineProperty(Camera.prototype, 'far', {
	get: function() { return this._far; },
	set: function(v) { 
		this._far = this.uniforms.u_camera_planes[1] = v;
		this._must_update_matrix = true;
	},
	enumerable: false //avoid problems
});

Object.defineProperty(Camera.prototype, 'view_matrix', {
	get: function() { return this._view_matrix; },
	set: function(v) { this._view_matrix.set(v); mat4.multiply(this._viewprojection_matrix, this._projection_matrix, this._view_matrix ); },
	enumerable: false 
});

Object.defineProperty(Camera.prototype, 'projection_matrix', {
	get: function() { return this._projection_matrix; },
	set: function(v) { this._projection_matrix.set(v); mat4.multiply(this._viewprojection_matrix, this._projection_matrix, this._view_matrix ); },
	enumerable: false 
});

Object.defineProperty(Camera.prototype, 'viewprojection_matrix', {
	get: function() { return this._viewprojection_matrix; },
	set: function(v) { this._viewprojection_matrix.set(v); },
	enumerable: false 
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
	this._fov = fov;
	this._aspect = aspect;
	this._near = near;
	this._far = far;
	
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
	this.type = Camera.ORTHOGRAPHIC;
	this._frustum_size = frustum_size;
	if(arguments.lenth > 1)
	{
		this._near = near;
		this._far = far;
		this._aspect = aspect || 1;
	}

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
		{
			if( this.frustum_size.constructor === Number )
				mat4.ortho(this._projection_matrix, -this.frustum_size*this._aspect, this.frustum_size*this._aspect, -this._frustum_size, this._frustum_size, this._near, this._far);
			else if( this.frustum_size.length )
				mat4.ortho(this._projection_matrix, this.frustum_size[0], this.frustum_size[1], this.frustum_size[2], this.frustum_size[3], this.frustum_size.length > 3 ? this.frustum_size[4] : this._near, this.frustum_size.length > 4 ? this.frustum_size[5] : this._far);
		}
		else
			mat4.perspective(this._projection_matrix, this._fov * DEG2RAD, this._aspect, this._near, this._far);

		if(this.flip_y)
			mat4.scale( this._projection_matrix, this._projection_matrix, [1,-1,1] );

		//view
		mat4.lookAt(this._view_matrix, this._position, this._target, this._up);

		//align
		if(this.view_texel_grid && this.type == Camera.ORTHOGRAPHIC)
		{
			var view_width = this.frustum_size.constructor === Number ? this.frustum_size * this._aspect : this.frustum_size[0];
			var view_height = this.frustum_size.constructor === Number ? this.frustum_size : this.frustum_size[1];
			var stepx = 2 * view_width / this.view_texel_grid[0];
			var stepy = 2 * view_height / this.view_texel_grid[1];
			this._view_matrix[12] = Math.floor( this._view_matrix[12] / stepx) * stepx;
			this._view_matrix[13] = Math.floor( this._view_matrix[13] / stepy) * stepy;
		}
	}

	if( this.is_reflection )
		mat4.scale( this._view_matrix, this._view_matrix, [1,-1,1] );

	mat4.multiply(this._viewprojection_matrix, this._projection_matrix, this._view_matrix );
	mat4.invert(this._model_matrix, this._view_matrix );
	
	this._must_update_matrix = false;

	mat4.rotateVec3( this._right, this._model_matrix, RD.RIGHT );
	mat4.rotateVec3( this._top,   this._model_matrix, RD.UP );
	mat4.rotateVec3( this._front, this._model_matrix, RD.FRONT );

	this.distance = vec3.distance(this._position, this._target);

	this.uniforms.u_camera_planes[0] = this._near;
	this.uniforms.u_camera_planes[1] = this._far;
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

Camera.prototype.localToGlobal = Camera.prototype.getLocalPoint;

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
* move the position and the target that amount
* @method move
* @param {vec3} v
* @param {Number} scalar [optional] it will be multiplied by the vector
*/
Camera.prototype.move = function(v, scalar)
{
	if(scalar !== undefined)
	{
		vec3.scale( temp_vec3, v, scalar );
		v = temp_vec3;
	}

	vec3.add(this._target, this._target, v);
	vec3.add(this._position, this._position, v);
	this._must_update_matrix = true;
}

/**
* move the position and the target using the local coordinates system of the camera
* @method moveLocal
* @param {vec3} v
* @param {Number} scalar [optional] it will be multiplied by the vector
*/
Camera.prototype.moveLocal = function(v, scalar)
{
	if(	this._must_update_matrix )
		this.updateMatrices();
	var delta = mat4.rotateVec3(temp_vec3, this._model_matrix, v);
	if(scalar !== undefined)
		vec3.scale( delta, delta, scalar );
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
	if(	this._must_update_matrix )
		this.updateMatrices();
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
	{
		if(	this._must_update_matrix )
			this.updateMatrices();
		axis = mat4.rotateVec3(temp_vec3b, this._model_matrix, axis);
	}
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
* @param {RD.Ray} [out] { origin: vec3, direction: vec3 }
* @return {RD.Ray} ray object { origin: vec3, direction:vec3 }
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
Camera.prototype.applyController = function( dt, event, speed, enable_wsad )
{
	speed  = speed || 10;
	if(dt)
	{
		var delta = vec3.create();
		if(gl.keys[ Camera.controller_keys.forward ] || (enable_wsad && gl.keys["W"]) )
			delta[2] = -1;
		else if(gl.keys[ Camera.controller_keys.back ] || (enable_wsad && gl.keys["S"]))
			delta[2] = 1;
		if(gl.keys[ Camera.controller_keys.left ] || (enable_wsad && gl.keys["A"]))
			delta[0] = -1;
		else if(gl.keys[ Camera.controller_keys.right ] || (enable_wsad && gl.keys["D"]))
			delta[0] = 1;
		if( vec3.sqrLen( delta ) )
			this.moveLocal( delta,dt * speed );
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
	vec3.lerp( this._position, this._position, camera._position, f );
	vec3.lerp( this._target, this._target, camera._target, f );
	vec3.lerp( this._up, this._up, camera._up, f );
	this._fov = this._fov * (1.0 - f) + camera._fov * f;
	this._near = this._near * (1.0 - f) + camera._near * f;
	this._far = this._far * (1.0 - f) + camera._far * f;

	if( this._frustum_size.constructor === Number )
		this._frustum_size = this._frustum_size * (1.0 - f) + camera._frustum_sizer * f;
	this._must_update_matrix = true;
}

//it rotates the matrix so it faces the camera
Camera.prototype.orientMatrixToCamera = function( matrix )
{
	matrix.set( this._right, 0 );
	matrix.set( this._top, 4 );
	matrix.set( this._front, 8 );
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


Camera.prototype.testMesh = (function(){ 
	if(!global.BBox) //no litegl installed
		return;

	var aabb = BBox.create();
	var center = aabb.subarray(0,3);
	var halfsize = aabb.subarray(3,6);

	return function( mesh, matrix )
	{
		//convert oobb to aabb
		var bounding = mesh.bounding;
		if(!bounding)
			return CLIP_INSIDE;
		BBox.transformMat4(aabb, bounding, matrix);
		return this.testBox(center,halfsize);
	}
})();
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
	this._nodes = [];
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
	this._nodes.length = 0;
	this._nodes_by_id = {};
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

//
/**
* Returns an array of nodes which bounding overlaps with a given bounding box
* You must call Scene.root.updateBoundingBox() to update the boundings
* 
* @method findNodesInBBox
* @param {BBox} box  use BBox.fromCenterHalfsize(center,halfsize) to define it
* @param {number} layers [optional] bitmask to filter by layer, otherwise 0xFFFF is used
*/
Scene.prototype.findNodesInBBox = function( box, layers, out )
{
	if(layers === undefined)
		layers = 0xFFFF;
	out = out || [];
	for(var i = 0; i < this.nodes.length; ++i)
	{
		var node = this.nodes[i];
		if(!node.bounding_box || !(node.layers & layers))
			continue;
		if( !geo.testBBoxBBox( node.bounding_box, box ) )
			continue;
		out.push( node );
	}
	return out;
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
* @param {number} layers bitmask to filter by layer, otherwise 0xFFFF is used
* @param {boolean} test_against_mesh test against every mesh
* @return {RD.SceneNode} node collided or null
*/
Scene.prototype.testRay = function( ray, result, max_dist, layers, test_against_mesh  )
{
	layers = layers === undefined ? 0xFFFF : layers;
	RD.Scene._ray_tested_objects = 0;
	if(!result)
		result = ray.collision_point;
	if(test_against_mesh === undefined)
		test_against_mesh = true;

	//TODO
	//broad phase
		//get all the AABBs of all objects
		//store them in an octree

	return this.root.testRay( ray, result, max_dist, layers, test_against_mesh );
}

//it returns to which node of the array collided (even if it collided with a child)
//if get_collision_node is true, then it will return the exact node it collided
RD.testRayWithNodes = function testRayWithNodes( ray, nodes, coll, max_dist, layers, test_against_mesh, get_collision_node )
{
	RD.testRayWithNodes.coll_node = null; //hack to store a temp var
	max_dist = max_dist == null ? Number.MAX_VALUE : max_dist;
	layers = layers === undefined ? 0xFFFF : layers;
	RD.Scene._ray_tested_objects = 0;
	if(!coll)
		coll = ray.collision_point;

	var local_result = vec3.create();

	//test against nodes
	var coll_node = null;
	for(var i = 0 ; i < nodes.length; ++ i )
	{
		var node = nodes[i];
		var child_collided = node.testRay( ray, local_result, max_dist, layers, test_against_mesh );
		if(!child_collided)
			continue;
		var distance = vec3.distance( ray.origin, local_result );
		if( distance < max_dist )
		{
			max_dist = distance;
			coll.set( local_result );
			RD.testRayWithNodes.coll_node = child_collided;
			if(!get_collision_node)
				coll_node = node; //child_collided;
			else
				coll_node = child_collided;
		}
	}	

	return coll_node;
}

//internal function to reuse computations
RD.testRayMesh = function( ray, local_origin, local_direction, model, mesh, group_index, result, max_dist, layers, test_against_mesh, two_sided )
{
	max_dist = max_dist == null ? Number.MAX_VALUE : max_dist;

	var bb = null;
	var subgroup = null;

	if( group_index == -1 )
	{
		bb = mesh.getBoundingBox();
		subgroup = mesh;
	}
	else
	{
		subgroup = mesh.info.groups[ group_index ];
		bb = subgroup.bounding;
		if(!bb)
		{
			mesh.computeGroupsBoundingBoxes();
			bb = subgroup.bounding;
		}
	}

	if(!bb) //mesh has no vertices
		return false;

	if(!max_dist)
		max_dist = 10000000;

	//test against object oriented bounding box
	var r = geo.testRayBBox( local_origin, local_direction, bb, null, temp_vec3 );
	if(!r) //collided with OOBB
		return false;

	vec3.transformMat4( result, temp_vec3, model );
	var distance = last_ray_distance = vec3.distance( ray.origin, result );

	//there was a collision but too far
	if( distance > max_dist )
		return false; 
	
	//test agains mesh
	if( !test_against_mesh )
		return true;

	//create mesh octree
	if(!subgroup._octree)
	{
		if( subgroup == mesh )
			subgroup._octree = new GL.Octree( mesh );
		else
			subgroup._octree = new GL.Octree( mesh, subgroup.start, subgroup.length );
	}

	//ray test agains octree
	var hit_test = subgroup._octree.testRay( local_origin, local_direction, 0, max_dist, two_sided );

	//collided the OOBB but not the mesh, so its a not
	if( !hit_test ) 
		return false;

	//compute global hit point
	result.set( hit_test.hit );
	vec3.transformMat4( result, result, model );
	distance = last_ray_distance = vec3.distance( ray.origin, result );

	//there was a collision but too far
	if( distance > max_dist )
		return false; 
	return true;
}


Scene.prototype.fromJSON = function(json)
{
	this.root.clear();
	this.root.configure( json );
}

Scene.prototype.toJSON = function( on_node_to_json )
{
	if(	on_node_to_json && on_node_to_json.constructor !== Function )
		on_node_to_json = null;

	var index = 0;
	var json = {};
	tojson(this.root,json);
	return json;
	
	function tojson(node,data)
	{
		if(on_node_to_json)
		{
			var r = on_node_to_json(node, data);
			if ( !r )
				return false;
		}
		else
		{
			if(!node.flags.no_transform)
			{
				data.position = typedArrayToArray(node.position);
				if(node.rotation[0] != 0 || node.rotation[1] != 0 || node.rotation[2] != 0 || node.rotation[3] != 1 )
					data.rotation = typedArrayToArray(node.rotation);
				if(node.scaling[0] != 1 || node.scaling[1] != 1 || node.scaling[2] != 1 )
					data.scaling = typedArrayToArray(node.scaling);
			}
			if(node.id)
				data.id = node.id;
			node.ref = data.ref = index++;
			if(node.mesh)
				data.mesh = node.mesh;
			if(node.submesh != null)
				data.submesh = node.submesh;
			if(node.draw_range)
				data.draw_range = node.draw_range.concat();
			if(node.material)
				data.material = node.material;
			if(node.shader)
				data.shader = node.shader;
			if(node.color[0] != 1 || node.color[1] != 1 || node.color[2] != 1 || node.color[3] != 1 )
				data.color = typedArrayToArray(node.color);
			if(Object.values(node.textures).filter(function(a){return a;}) > 0)
				data.shader = node.shader;
			if(node.extra)
				data.extra = node.extra;

			data.layers = node.layers;
			data.flags = node.flags;
		}

		if(!node.children.length)
			return true;
		var children_data = [];
		for(var i = 0; i < node.children.length; ++i)
		{
			var child = node.children[i];
			var child_json = {};
			if( tojson(child,child_json) )
				children_data.push(child_json);
		}
		if(children_data.length)
			data.children = children_data;
		return true;
	}
}

/**
* Material is a data container about the properties of an objects material
* @class Material
* @constructor
*/
function Material(o)
{
	this._color = vec4.fromValues(1,1,1,1);
	this.shader_name = null;

	this.uniforms = {
		u_color: this._color
	};
	this.textures = {};

	this.primitive = GL.TRIANGLES;

	this.blend_mode = RD.BLEND_NONE;

	this.flags = {
		two_sided: false,
		depth_test: true,
		depth_write: true
	};

	if(o)
		this.configure(o);
}

Material.default_shader_name = "texture";

Object.defineProperty( Material.prototype, "color", {
	set: function(v){
		this._color.set(v);
	},
	get: function() { return this._color; },
	enumerable: true
});

/**
* This number is the 4º component of color but can be accessed directly 
* @property opacity {number}
*/
Object.defineProperty( Material.prototype, 'opacity', {
	get: function() { return this._color[3]; },
	set: function(v) { this._color[3] = v; },
	enumerable: true //avoid problems
});

//because color and albedo is the same
Object.defineProperty( Material.prototype, "albedo", {
	set: function(v){
		this._color.set(v);
	},
	get: function() { return this._color; },
	enumerable: false
});

Material.prototype.configure = function(o)
{
	for(var i in o)
		this[i] = o[i];
}

Material.prototype.serialize = function()
{
	var o = {
		flags: this.flags,
		textures: this.textures
	};

	o.color = typedArrayToArray( this._color );
	if(this.name)
		o.name = this.name;
	if(this.alphaMode)
		o.alphaMode = this.alphaMode;
	if(this.alphaCutoff != 0.5)
		o.alphaCutoff = this.alphaCutoff;
	if(this.uv_transform)
		o.uv_transform = this.uv_transform;
	if(this.normalFactor)
		o.normalFactor = this.normalFactor;
	if(this.displacementFactor)
		o.displacementFactor = this.displacementFactor;
	if(this.model)
	{
		o.model = this.model;
		o.metallicFactor = this.metallicFactor;
		o.roughnessFactor = this.roughnessFactor;
		if(this.emissive)
			o.emissive = typedArrayToArray( this.emissive );
	}

	return o;
}

Material.prototype.render = function( renderer, model, mesh, indices_name, group_index )
{
	//get shader
	var shader_name = this.shader_name;
	if(!shader_name)
	{
		if( this.model == "pbrMetallicRoughness" )
			shader_name = "texture_albedo";
		else
			shader_name = renderer.default_shader_name || RD.Material.default_shader_name;
	}
	var shader = gl.shaders[ shader_name ];
	if (!shader)
	{
		var color_texture = this.textures.color || this.textures.albedo;
		shader = color_texture ? renderer._texture_shader : renderer._flat_shader;
	}

	//get texture
	var slot = 0;
	var texture = null;
	for(var i in this.textures)
	{
		var texture_name = this.textures[i];
		if(!texture_name)
			continue;
		if( texture_name.constructor === Object ) //in case it has properties for this channel
			texture_name = texture_name.texture;
		var texture_uniform_name = "u_" + i + "_texture";

		if( shader && !shader.samplers[ texture_uniform_name ]) //texture not used in shader
			continue; //do not bind it

		texture = gl.textures[ texture_name ];
		if(!texture)
		{
			if(renderer.autoload_assets && texture_name.indexOf(".") != -1)
				renderer.loadTexture( texture_name, renderer.default_texture_settings );
			texture = gl.textures[ "white" ];
		}

		this.uniforms[ texture_uniform_name ] = texture.bind( slot++ );
	}

	//flags
	renderer.enableItemFlags( this );

	renderer._uniforms.u_model.set( model );
	shader.uniforms( renderer._uniforms ); //globals
	shader.uniforms( this.uniforms ); //locals

	var group = null;
	if( group_index != null && mesh.info && mesh.info.groups && mesh.info.groups[ group_index ] )
		group = mesh.info.groups[ group_index ];

	if(group)
		shader.drawRange( mesh, this.primitive, group.start, group.length, indices_name );
	else
		shader.draw( mesh, this.primitive, indices_name );

	renderer.disableItemFlags( this );
	renderer.draw_calls += 1;
}

RD.Material = Material;

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
	this.reverse_normals = false; //used for reflections
	this.layers_affect_children = false;
	
	this.assets_folder = "";
	
	this._view_matrix = mat4.create();
	this._projection_matrix = mat4.create();
	this._viewprojection_matrix = mat4.create();
	this._mvp_matrix = mat4.create();
	this._model_matrix = mat4.create();
	this._texture_matrix = mat3.create();
	this._color = vec4.fromValues(1,1,1,1); //in case we need to set a color
	this._viewprojection2D_matrix = mat4.create(); //used to 2D rendering
	
	this._nodes = [];
	this._uniforms = {
		u_view: this._view_matrix,
		u_viewprojection: this._viewprojection_matrix,
		u_model: this._model_matrix,
		u_mvp: this._mvp_matrix,
		u_global_alpha_clip: 0.0,
		u_color: this._color,
		u_texture_matrix: this._texture_matrix
	};

	this.global_uniforms_containers = [ this._uniforms ];
	
	//set some default stuff
	global.gl = this.gl;
	this.canvas = gl.canvas;

	this.assets_folder = options.assets_folder || "";
	this.autoload_assets = options.autoload_assets !== undefined ? options.autoload_assets : true;
	this.default_texture_settings = { wrap: gl.REPEAT, minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.LINEAR };
	this.default_cubemap_settings = { minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.LINEAR, is_cross: 1 };
	
	
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

Object.defineProperty( Renderer.prototype, "color", {
	set: function(v){
		this._color.set(v);
	},
	get: function() { return this._color; },
	enumerable: true
});

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
* @param {Number} layers [Optional] bit mask with which layers should be rendered, if omited then 0xFFFF is used (8 first layers)
* @param {CustomPipeline} pipeline [Optional] allows to pass a class that will handle the rendering of the scene, check PBRPipeline from the repo for an example 
* @param {Boolean} skip_fbo [Optional] in case you are rendering to a texture and you have already set your own FBOs (for custom pipelineS)
*/
Renderer.prototype.render = function( scene, camera, nodes, layers, pipeline, skip_fbo )
{
	if(layers == null)
		layers = 0xFFFF;

	if (!scene)
		throw("Renderer.render: scene not provided");

	if(	this._current_scene )
	{
		this._current_scene = null;
		throw("Cannot render an scene while rendering an scene");
	}

	camera = camera || scene.camera;
	if (!camera)
		throw("Renderer.render: camera not provided");
	
	global.gl = this.gl;
	
	//find which nodes should we render
	this._nodes.length = 0;
	if(!nodes)
		scene._root.getVisibleChildren( this._nodes, layers, this.layers_affect_children );
	nodes = nodes || this._nodes;

	if(!nodes.length && 0)//even if no nodes in the scene, somebody may want to render something using the callbacks
	{
		scene.frame++;
		this.frame++;
		return;
	}

	//get matrices in the camera
	this.enableCamera( camera );
	this.enable2DView();

	//stack to store state
	this._state = [];
	this._meshes_missing = 0;
	//this.draw_calls = 0;
	this._current_scene = scene;

	//set globals
	this._uniforms.u_time = scene.time;

	//precompute distances
	if(this.sort_by_distance)
		nodes.forEach( function(a) { a._distance = a.getDistanceTo( camera._position ); } );

	//filter by mustRender (you can do your frustum culling here)
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
	if(this.onPreRender)
		this.onPreRender( camera );

	if(scene._root.preRender)
		scene._root.preRender( this, camera );

	pipeline = pipeline || this.pipeline;

	if( pipeline )
		pipeline.render( this, nodes, camera, scene, skip_fbo );
	else
	{
		for (var i = 0; i < nodes.length; ++i)
		{
			var node = nodes[i];
			
			//recompute matrices
			node.updateGlobalMatrix(true);
			
			if(this.onPreRenderNode)
				this.onPreRenderNode( node, camera);
			if(node.preRender)
				node.preRender( this, camera );
		}
		
		//rendering	
		for (var i = 0; i < nodes.length; ++i)
		{
			var node = nodes[i];
			node.flags.was_rendered = false;
			if(node.flags.visible === false || !(node.layers & layers) )
				continue;
			if(this.mustRenderNode && this.mustRenderNode(node, camera) === false)
				continue;
			node.flags.was_rendered = true;
			this.setModelMatrix( node._global_matrix );
			
			if(node.render)
				node.render(this, camera);
			else
				this.renderNode(node, camera);
		}
		
		//post rendering
		if(scene._root.postRender)
			scene._root.postRender(this,camera);
		for (var i = 0; i < nodes.length; ++i)
		{
			var node = nodes[i];
			if(node.postRender)
				node.postRender(this,camera);
			if(this.onPostRenderNode)
				this.onPostRenderNode( node, camera);
		}
	}

	if(this.onPostRender)
		this.onPostRender( camera );
	
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

//in case you are going to use functions to render in 2D in screen space
Renderer.prototype.enable2DView = function()
{
	mat4.ortho( this._viewprojection2D_matrix, 0,gl.viewport_data[2], 0, gl.viewport_data[3], -1, 1 );
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

//assign and updated viewprojection matrix
Renderer.prototype.setModelMatrix = function(matrix)
{
	this._model_matrix.set( matrix );
	mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, matrix );
}

/*
Renderer.prototype.setTextureMatrixForSpriteAtlas = function( matrix, frame, num_cols, num_rows )
{
	mat3.identity( matrix );
	var x = (frame % num_cols) / num_cols;
	var y = Math.floor(frame / num_cols) / num_rows;
	mat3.translate( matrix, matrix, [x,y,0] );
	mat3.scale( matrix, matrix, [ 1/num_cols, 1/num_rows,0] );
}
*/



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

//avoid garbage
var instancing_uniforms = {
	u_model: null
};

//used to render one node (ignoring its children) based on the shader, texture, mesh, flags, layers and uniforms 
Renderer.prototype.renderNode = function(node, camera)
{
	//get mesh
	var mesh = null;
	if (node._mesh) //hardcoded mesh
		mesh = node._mesh;
	else if (node.mesh) //shared mesh
	{
		mesh = gl.meshes[ node.mesh ];
		if(!mesh)
		{
			this._meshes_missing++;
			if(this.autoload_assets && node.mesh.indexOf(".") != -1)
				this.loadMesh( node.mesh );
		}
	}

	//from GLTF
	if( node.primitives && node.primitives.length )
	{
		if(!mesh)
			return;
		for(var i = 0; i < node.primitives.length; ++i)
		{
			var prim = node.primitives[i];
			var material = this.overwrite_material || RD.Materials[ prim.material ];
			if(material)
				this.renderMeshWithMaterial( node._global_matrix, mesh, material, "triangles", i );
		}
		return;
	}

	if(mesh && (node.material || this.overwrite_material) )
	{
		var material = this.overwrite_material || RD.Materials[ node.material ];
		if(material)
		{
			if(material.render)
			{
				this.renderMeshWithMaterial( node._global_matrix, mesh, material, node.indices, node.submesh );
				return;
			}
			else
				node.color = material.color;
		}
	}
		
	if(!mesh)
	{
		if(node.onRender)
			node.onRender(this, camera);
		return;
	}

	var instancing = false;
	if( node._instances && (gl.webgl_version > 1 || gl.extensions.ANGLE_instanced_arrays) )
		instancing = true;

	//get shader
	var shader = null;
	var shader_name = node.shader;
	if (this.on_getShader)
		shader = this.on_getShader( node, camera );
	else
	{
		if (!shader && node.shader)
			shader = gl.shaders[ shader_name ];
		if(this.shader_overwrite)
			shader = gl.shaders[this.shader_overwrite];
	}
	if (!shader)
		shader = node.textures.color ? this._texture_shader : this._flat_shader;

	//shader doesnt support instancing
	if(instancing && !shader.attributes.u_model)
		instancing = false;
	
	//get texture
	var slot = 0;
	var texture = null;
	for(var i in node.textures)
	{
		var texture_name = node.textures[i];
		if(!texture_name)
			continue;
		if( texture_name.constructor === Object ) //in case it has properties for this channel
			texture_name = texture_name.texture;

		var texture_uniform_name = "u_" + i + "_texture";

		if(shader && !shader.samplers[ texture_uniform_name ]) //texture not used in shader
			continue; //do not bind it

		texture = gl.textures[ texture_name ];
		if(!texture)
		{
			if(this.autoload_assets && texture_name.indexOf(".") != -1)
				this.loadTexture( texture_name, this.default_texture_settings );
			texture = gl.textures[ "white" ];
		}

		if( node.flags.pixelated )
		{
			texture.bind(0);
			gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
			gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
		}
		else if ( node.flags.pixelated === false )
		{
			texture.bind(0);
			gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
			gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR );
		}

		node._uniforms[texture_uniform_name] = texture.bind( slot++ );
	}

	//flags
	if(!this.ignore_flags)
		this.enableItemFlags( node );
	
	if(node.onRender)
		node.onRender(this, camera, shader);

	//allows to have several global uniforms containers
	for(var i = 0; i < this.global_uniforms_containers.length; ++i)
		shader.uniforms( this.global_uniforms_containers[i] ); //globals
	if(!this.skip_node_uniforms)
		shader.uniforms( node._uniforms ); //node specifics
	if(node.onShaderUniforms) //in case the node wants to add extra shader uniforms that need to be computed at render time
		node.onShaderUniforms(this, shader);
	if(this.onNodeShaderUniforms) //in case the node wants to add extra shader uniforms that need to be computed at render time
		this.onNodeShaderUniforms(this, shader, node );

	var group = null;
	if( node.submesh != null && mesh.info && mesh.info.groups && mesh.info.groups[ node.submesh ] )
		group = mesh.info.groups[ node.submesh ];

	if(instancing)
	{
		instancing_uniforms.u_model = node._instances;
		if(group)
			shader.drawInstanced( mesh, node.primitive === undefined ? gl.TRIANGLES : node.primitive, node.indices, instancing_uniforms, group.start, group.length );
		else if(node.draw_range)
			shader.drawInstanced( mesh, node.primitive === undefined ? gl.TRIANGLES : node.primitive, node.indices, instancing_uniforms, node.draw_range[0], node.draw_range[1] );
		else
			shader.drawInstanced( mesh, node.primitive === undefined ? gl.TRIANGLES : node.primitive, node.indices, instancing_uniforms );
	}
	else
	{
		if(group)
			shader.drawRange( mesh, node.primitive === undefined ? gl.TRIANGLES : node.primitive, group.start, group.length, node.indices );
		else if(node.draw_range)
			shader.drawRange( mesh, node.primitive === undefined ? gl.TRIANGLES : node.primitive, node.draw_range[0], node.draw_range[1] , node.indices );
		else
			shader.draw( mesh, node.primitive === undefined ? gl.TRIANGLES : node.primitive, node.indices );
	}

	if(!this.ignore_flags)
		this.disableItemFlags( node );

	this.draw_calls += 1;
}

Renderer.prototype.renderMesh = function( model, mesh, texture, color, shader, mode, index_buffer_name, group_index )
{
	if(!mesh)
		return;
	if( color )
		this._uniforms.u_color.set( color );
	if(!model)
		model = RD.IDENTITY;
	this._uniforms.u_model.set( model );
	if(!shader)
		shader = texture ? gl.shaders["texture"] : gl.shaders["flat"];
	if( texture )
		this._uniforms.u_texture = texture.bind(0);
	shader.uniforms(this._uniforms);
	shader.draw( mesh, mode === undefined ? gl.TRIANGLES : mode, index_buffer_name );
	this.draw_calls += 1;
}

Renderer.prototype.renderMeshWithMaterial = function( model, mesh, material, index_buffer_name, group_index )
{
	if(material.render)
		material.render( this, model, mesh, index_buffer_name, group_index );
}

//allows to pass a mesh or a bounding box
Renderer.prototype.renderBounding = function(mesh_or_bb, matrix)
{
	if(!mesh_or_bb)
		return;
	matrix = matrix || RD.IDENTITY;

	var m = this._uniforms.u_model;
	var bb = null;
	if( mesh_or_bb.constructor === GL.Mesh )
		bb = mesh_or_bb._bounding;
	else
		bb = mesh_or_bb;

	var s = bb.subarray(3,6); //halfsize
	mat4.translate( m, matrix, bb.subarray(0,3) );
	mat4.scale( m, m, [s[0]*2,s[1]*2,s[2]*2] );
	this.renderMesh( m, gl.meshes["cube"], null, [1,1,0,1], null, gl.LINES, "wireframe" );
}

Renderer.prototype.enableItemFlags = function(item)
{
	var ff = item.flags.flip_normals;
	if(this.reverse_normals)
		ff = !ff;
	gl.frontFace( ff ? gl.CW : gl.CCW );
	gl[ item.flags.depth_test === false ? "disable" : "enable"]( gl.DEPTH_TEST );
	if( item.flags.depth_write === false )
		gl.depthMask( false );
	gl[ item.flags.two_sided === true ? "disable" : "enable"]( gl.CULL_FACE );
	
	//blend
	if(	item.blend_mode !== RD.BLEND_NONE)
	{
		gl.enable( gl.BLEND );
		switch( item.blend_mode )
		{
			case RD.BLEND_ALPHA: gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA ); break;
			case RD.BLEND_ADD: gl.blendFunc( gl.SRC_ALPHA, gl.ONE ); break;
			case RD.BLEND_MULTIPLY: gl.blendFunc( gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA ); break;
		}
	}
	else
		gl.disable( gl.BLEND );

	//PBR Materials
	if(item.alphaMode == "BLEND")
	{
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		gl.depthMask( false );
	}
}

Renderer.prototype.disableItemFlags = function(item)
{
	if( item.flags.flip_normals ) gl.frontFace( gl.CCW );
	if( item.flags.depth_test === false ) gl.enable( gl.DEPTH_TEST );
	if( item.blend_mode !== RD.BLEND_NONE ) gl.disable( gl.BLEND );
	if( item.flags.two_sided ) gl.disable( gl.CULL_FACE );
	if( item.flags.depth_write === false )
		gl.depthMask( true );

	if(item.alphaMode == "BLEND")
	{
		gl.depthMask( true );
		gl.disable( gl.BLEND );
	}
}

Renderer.prototype.setPointSize = function(v)
{
	this.point_size = v;
	gl.shaders["point"].uniforms({u_pointSize: this.point_size});
}


/**
* Helper method to render points very fast
* positions and extra must be a Float32Array with all the positions, extra must have 4
* @method renderPoints
* @param {Float32Array} positions
* @param {Float32Array} extra used to stored extra info per point
* @param {RD.Camera} camera
* @param {Number} num_points
* @param {GL.Shader} shader
* @param {Number} point_size
*/
RD.Renderer.prototype.renderPoints = function( positions, extra, camera, num_points, shader, point_size, primitive, texture )
{
	if(!positions || positions.constructor !== Float32Array)
		throw("RD.renderPoints only accepts Float32Array");
	if(!shader)
	{
		if( texture )
		{
			shader = this.shaders["_points_textured"];
			if(!shader)
			{
				shader = this.shaders["_points_textured"] = new GL.Shader( RD.points_vs_shader, RD.points_fs_shader, { "TEXTURED":""} );
				shader.uniforms({u_texture:0, u_atlas: 1, u_pointSize: 1});
			}
		}
		else
		{
			shader = this.shaders["_points"];
			if(!shader)
			{
				shader = this.shaders["_points"] = new GL.Shader( RD.points_vs_shader, RD.points_fs_shader );
				shader.uniforms({u_texture:0, u_atlas: 1, u_pointSize: 1});
			}
		}
	}

	point_size = point_size || 1;

	var max_points = 1024;
	num_points = num_points || positions.length / 3;
	var positions_data = null;
	var extra_data = null;
	var mesh = this._points_mesh;

	if( num_points > positions.length / 3)
		num_points = positions.length / 3;

	if( !mesh || positions.length > (max_points*3) )
	{
		if( num_points > max_points )
			max_points = GL.Texture.nextPOT( num_points );
		positions_data = new Float32Array( max_points * 3 );
		extra_data = new Float32Array( max_points * 4 );
		mesh = this._points_mesh = GL.Mesh.load({ vertices: positions_data, extra4: extra_data });
	}
	else
	{
		positions_data = this._points_mesh.getBuffer("vertices").data;
		extra_data = this._points_mesh.getBuffer("extra4").data;
	}

	positions_data.set( positions_data.length > positions.length ? positions : positions.subarray(0, positions_data.length) );
	if(extra)
		extra_data.set( extra_data.length > extra.length ? extra : extra.subarray(0, extra_data.length) );
	else if( extra_data.fill ) //fill with zeros
		extra_data.fill(0);
	mesh.upload( GL.DYNAMIC_STREAM );

	shader.setUniform( "u_color", this._color );
	shader.setUniform( "u_pointSize", point_size );
	shader.setUniform( "u_camera_perspective", camera._projection_matrix[5] );
	shader.setUniform( "u_viewport", gl.viewport_data );
	shader.setUniform( "u_viewprojection", camera._viewprojection_matrix );
	if(texture)
		shader.setUniform( "u_texture", texture.bind(0) );
	shader.drawRange( mesh, primitive !== undefined ? primitive : GL.POINTS, 0, num_points );

	return mesh;
}

RD.points_vs_shader = "\n\
precision highp float;\n\
attribute vec3 a_vertex;\n\
attribute vec4 a_extra4;\n\
varying vec3 v_pos;\n\
varying vec4 v_extra4;\n\
uniform mat4 u_viewprojection;\n\
uniform vec4 u_viewport;\n\
uniform float u_camera_perspective;\n\
uniform float u_pointSize;\n\
\n\
float computePointSize( float radius, float w )\n\
{\n\
	if(radius < 0.0)\n\
		return -radius;\n\
	return u_viewport.w * u_camera_perspective * radius / w;\n\
}\n\
\n\
void main() {\n\
	v_pos = a_vertex;\n\
	v_extra4 = a_extra4;\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
	gl_PointSize = computePointSize( u_pointSize, gl_Position.w );\n\
}\n\
";

RD.points_fs_shader = "\n\
precision highp float;\n\
uniform vec4 u_color;\n\
vec2 remap(in vec2 value, in vec2 low1, in vec2 high1, in vec2 low2, in vec2 high2 ) { vec2 range1 = high1 - low1; vec2 range2 = high2 - low2; return low2 + range2 * (value - low1) / range1; }\n\
#ifdef TEXTURED\n\
	uniform sampler2D u_texture;\n\
#endif\n\
#ifdef FS_UNIFORMS\n\
	FS_UNIFORMS\n\
#endif\n\
\n\
void main() {\n\
	vec4 color = u_color;\n\
	#ifdef TEXTURED\n\
		color *= texture2D( u_texture, gl_FragCoord );\n\
	#endif\n\
	#ifdef FS_CODE\n\
		FS_CODE\n\
	#endif\n\
	gl_FragColor = color;\n\
}\n\
";

//for rendering lines...
	//stream vertices with pos in triangle strip form (aberrating jumps)
	//stream extra2 with info about line corner (to inflate)

Renderer.prototype.renderLines = function( positions, lineWidth, strip, model )
{
	if(!positions || positions.constructor !== Float32Array)
		throw("RD.renderPoints only accepts Float32Array");
	var shader = this.shaders["_lines"];
	if(!shader)
		shader = this.shaders["_lines"] = new GL.Shader( RD.lines_vs_shader, this._flat_fragment_shader );

	var camera = this._camera;
	var max_points = 1024;
	var num_points = positions.length / 3;
	var total_vertices = ( strip ? num_points * 2 : num_points * 4 );
	var positions_data = null;
	var normals_data = null;
	var extra_data = null;
	var mesh = this._lines_mesh;

	if( !mesh || (total_vertices * 3) > mesh.getBuffer("vertices").data.length )
	{
		max_points = GL.Texture.nextPOT( total_vertices );
		positions_data = new Float32Array( max_points * 3 );
		normals_data = new Float32Array( max_points * 3 ); //store tangent, not normal
		extra_data = new Float32Array( max_points * 2 );
		indices_data = new Uint16Array( max_points * 3 ); //for every 2 points (line) there is 6 indices (two triangles)
		mesh = this._lines_mesh = GL.Mesh.load({ triangles: indices_data, vertices: positions_data, normals: normals_data, extra2: extra_data });
	}
	else
	{
		positions_data = this._lines_mesh.getBuffer("vertices").data;
		normals_data = this._lines_mesh.getBuffer("normals").data;
		extra_data = this._lines_mesh.getBuffer("extra2").data;
		indices_data = this._lines_mesh.getIndexBuffer("triangles").data;
	}

	var left_uv = vec2.fromValues(-1,-1);
	var right_uv = vec2.fromValues(1,-1);
	var left2_uv = vec2.fromValues(-1,1);
	var right2_uv = vec2.fromValues(1,1);
	var N = vec3.create();

	//fill
	if(!strip)
	{
		var num_lines = Math.floor(num_points/2); //one line per 2 points

		var indices = [];
		//i is index of line
		for(var i = 0; i < num_lines; ++i)
		{
			var iv = i*2; //index of vertex
			var v1 = positions.subarray(iv*3,iv*3+3);
			var v2 = positions.subarray(iv*3+3,iv*3+6);
			vec3.sub(N,v2,v1);

			positions_data.set(v1,i*12);
			positions_data.set(v1,i*12+3);
			positions_data.set(v2,i*12+6);
			positions_data.set(v2,i*12+9);

			normals_data.set(N,i*12);
			normals_data.set(N,i*12+3);
			normals_data.set(N,i*12+6);
			normals_data.set(N,i*12+9);

			extra_data.set(left_uv,i*8);
			extra_data.set(right_uv,i*8+2);
			extra_data.set(left2_uv,i*8+4);
			extra_data.set(right2_uv,i*8+6);

			indices_data.set([i*4+0,i*4+2,i*4+1,i*4+1,i*4+2,i*4+3], i*6);
		}
	}
	else
	{
		throw("strip lines not supported yet");
	}

	mesh.upload( GL.DYNAMIC_STREAM );

	gl.enable( gl.CULL_FACE );
	shader.setUniform( "u_model", model || RD.IDENTITY );
	shader.setUniform( "u_color", this._color );
	shader.setUniform( "u_camera_front", camera._front );
	shader.setUniform( "u_camera_position", camera.eye );
	shader.setUniform( "u_lineWidth", lineWidth*0.5 );
	shader.setUniform( "u_camera_perspective", camera._projection_matrix[5] );
	shader.setUniform( "u_viewport", gl.viewport_data );
	shader.setUniform( "u_viewprojection", camera._viewprojection_matrix );
	shader.drawRange( mesh, gl.TRIANGLES, 0, num_points * 6);

	return mesh;
}

RD.lines_vs_shader = "\n\
precision highp float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_extra2;\n\
uniform mat4 u_model;\n\
uniform mat4 u_viewprojection;\n\
uniform vec4 u_viewport;\n\
uniform vec3 u_camera_front;\n\
uniform vec3 u_camera_position;\n\
uniform float u_camera_perspective;\n\
uniform float u_lineWidth;\n\
\n\
float computePointSize( float radius, float w )\n\
{\n\
	if(radius < 0.0)\n\
		return -radius;\n\
	return u_viewport.w * u_camera_perspective * radius / w;\n\
}\n\
void main() {\n\
	vec3 T = normalize( (u_model * vec4(a_normal,0.0)).xyz );\n\
	vec3 pos = (u_model * vec4(a_vertex,1.0)).xyz;\n\
	vec3 pos2 = (u_model * vec4(a_vertex + T,1.0)).xyz;\n\
	vec3 front = u_camera_front;//normalize( a_vertex - u_camera_position );\n\
	T = normalize( pos2 - pos ) ;\n\
	//float proj_w = (u_viewprojection * vec4(a_vertex,1.0)).w;\n\
	//float fixed_size_factor = computePointSize( u_lineWidth, proj_w );\n\
	vec3 side = normalize( cross(T,front) * a_extra2.x ) * u_lineWidth;\n\
	pos += side;\n\
	gl_Position = u_viewprojection * vec4(pos,1.0);\n\
}\n\
";

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

	var new_tex = null;
	
	if( url.indexOf("CUBEMAP") != -1 )
		new_tex = GL.Texture.cubemapFromURL( full_url, this.default_cubemap_settings, inner_callback );
	else if(this.credentials) //hack for CORS
	{
		if(this.credentials.headers)
			this.credentials.headers['Content-Type'] = "application/octet-stream";
		else
			this.credentials.headers = { 'Content-Type': 'application/octet-stream' };

		new_tex = new GL.Texture(1,1,options);

		fetch( full_url, this.credentials ).then( function(response) { 
			 if (!response.ok)
			    throw new Error("HTTP " + response.status + ":" + response.statusText );
			return response.arrayBuffer();
		}).then( function(buffer) {
			var image_local_url = URL.createObjectURL( new Blob([buffer]) ); //,{ type : mimeType }
			options.texture = new_tex;
			new_tex = GL.Texture.fromURL( image_local_url, options, inner_callback );
			options.texture = null;
			setTimeout( function(){ URL.revokeObjectURL( image_local_url ); }, 60 * 1000 );
		});
	}
	else
		new_tex = GL.Texture.fromURL( full_url, options, inner_callback );

	function inner_callback(t){
		if(that.debug)
			console.log(" + texture loaded: " + url );
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
	}

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
Renderer.prototype.loadShaders = function( url, on_complete, extra_macros )
{
	var that = this;
	
	if(url.indexOf("://") == -1)
		url = this.assets_folder + url;

	url += "?nocache=" + Math.random();

	this.loading_shaders = true;
	
	//load shaders code from a files atlas
	GL.loadFileAtlas( url, function( files ){
		that.compileShadersFromAtlas( files, extra_macros );
		that.loading_shaders = false;
		if(on_complete)
			on_complete(files);
	});
}

/**
* Compiles shaders from Atlas file format (check GL.loadFileAtlas in litegl)
* @method compileShadersFromAtlasCode
* @param {String} shaders_code big text file containing the shaders in shader atlas format
* @param {Object} extra_macros object containing macros that must be included in all
*/
Renderer.prototype.compileShadersFromAtlasCode = function(shaders_code, extra_macros)
{
	var subfiles = GL.processFileAtlas(shaders_code);
	this.compileShadersFromAtlas( subfiles, extra_macros );
}

//takes several subfiles (strings) and process them to compile shaders
Renderer.prototype.compileShadersFromAtlas = function(files, extra_macros)
{
	var info = files["shaders"];
	if(!info)
	{
		console.warn("No 'shaders' found in shaders file atlas, check documentation");
		return;
	}
	 
	this.shader_files = files;

	//expand #imports "..."
	for(var i in files)
		files[i] = GL.Shader.expandImports( files[i], files );
	 
	//compile shaders
	var lines = info.split("\n");
	for(var i = 0; i < lines.length; ++i)
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
			for(var k in macros)
				final_macros[k] = macros[k];
			for(var k in extra_macros)
				final_macros[k] = extra_macros[k];
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

Renderer.cubemap_info = [ 
	{ front: [ 1.0,  0.0,  0.0], up: [0.0, -1.0,  0.0] }, //POSX
	{ front: [-1.0,  0.0,  0.0], up: [0.0, -1.0,  0.0] }, //NEGX
	{ front: [ 0.0,  1.0,  0.0], up: [0.0,  0.0,  1.0] }, //POSY
	{ front: [ 0.0, -1.0,  0.0], up: [0.0,  0.0, -1.0] }, //NEGY
	{ front: [ 0.0,  0.0,  1.0], up: [0.0, -1.0,  0.0] }, //POSZ
	{ front: [ 0.0,  0.0, -1.0], up: [0.0, -1.0,  0.0] } //NEGZ
];

Renderer.prototype.renderToCubemap = function( cubemap, scene, position, nodes, layers, near, far )
{
	var camera = Renderer.cubemap_camera;
	if(!camera)
		Renderer.cubemap_camera = camera = new RD.Camera();

	near = near || 0.1;
	far = far || 1000;

	camera.perspective(90,1,near,far);
	var front = vec3.create();
	var that = this;

	cubemap.drawTo(function(tex,i){
		var side = Renderer.cubemap_info[i];
		vec3.add( front, position, side.front );
		camera.lookAt( position, front, side.up );
		that.clear();
		that.render(scene, camera, nodes, layers );
	});

	return cubemap;
}

Renderer.prototype.drawSphere3D = function( pos, radius, color )
{
	if(!gl.meshes["sphere"])
		gl.meshes["sphere"] = GL.Mesh.sphere({slices:32});
	var shader = gl.shaders["flat"];
	shader.setUniform("u_color",color);
	shader.setUniform("u_viewprojection",this._viewprojection_matrix);
	var m = temp_mat4;
	mat4.identity(m);
	mat4.translate(m,m,pos);
	mat4.scale(m,m,[radius,radius,radius]);
	shader.setUniform("u_model",m);
	shader.draw( gl.meshes[ "sphere" ] );
	this.draw_calls += 1;
}


Renderer.prototype.drawCircle2D = function( x,y, radius, color, fill )
{
	if(!gl.meshes["circle"])
		gl.meshes["circle"] = GL.Mesh.circle({radius:1,slices:32});
	if(!gl.meshes["ring"])
		gl.meshes["ring"] = GL.Mesh.ring({radius:1,thickness:0.02,slices:64});
	var shader = gl.shaders["flat"];
	shader.setUniform("u_color",color);
	shader.setUniform("u_viewprojection",this._viewprojection2D_matrix);
	var m = temp_mat4;
	mat4.identity(m);
	mat4.translate(m,m,[x,y,0]);
	mat4.scale(m,m,[radius*2,radius*2,radius*2]);
	shader.setUniform("u_model",m);
	shader.draw( gl.meshes[ fill ? "circle" : "ring" ] );
	this.draw_calls += 1;
}

Renderer.prototype.drawLine2D = function( x,y, x2,y2, width, color, shader )
{
	var mesh = gl.meshes["plane"];
	shader = shader || gl.shaders["flat"];
	shader.setUniform("u_color",color);
	shader.setUniform("u_viewprojection",this._viewprojection2D_matrix);
	var m = temp_mat4;
	var dx = x2-x;
	var dy = y2-y;
	var angle = Math.atan2(dx,dy);
	var dist = Math.sqrt(dx*dx+dy*dy);
	width /= 2;
	mat4.identity(m);
	mat4.translate(m,m,[(x+x2)*0.5,(y+y2)*0.5,0]);
	mat4.rotate(m,m,angle,RD.FRONT);
	var f = width;
	mat4.scale(m,m,[f,dist,f]);
	shader.setUniform("u_model",m);
	shader.draw( mesh );
	this.draw_calls += 1;
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
	this.collision_point = vec3.create();

	if(origin)
		this.origin.set( origin );
	if(direction)
		this.direction.set( direction );
}

RD.Ray = Ray;

Ray.prototype.testPlane = function( P, N )
{
	return geo.testRayPlane( this.origin, this.direction, P, N, this.collision_point );
}

Ray.prototype.testSphere = function( center, radius, max_dist )
{
	return geo.testRaySphere( this.origin, this.direction, center, radius, this.collision_point, max_dist );
}

Ray.prototype.closestPointOnRay = function( origin, direction, closest )
{
	closest = closest || vec3.create();
	var end = vec3.create();
	vec3.add(end, this.origin, this.direction );
	var end2 = vec3.create();
	vec3.add(end2, origin, direction );
	geo.closestPointBetweenLines( this.origin, end, origin, end2, null, closest );
	return closest;
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
	grid: { mesh:"grid", primitive: 1, color: [0.5,0.5,0.5,0.5], blend_mode: RD.BLEND_ALPHA },
	mesh: { shader: "phong" },
	sphere: { mesh:"sphere", shader: "phong" },
	floor: { mesh:"planeXZ", scaling: 10, shader: "phong" }
};

//**other useful classes

//This node allows to render a mesh where vertices are changing constantly
function DynamicMeshNode(o)
{
	this._ctor();
	if(o)
		this.configure(o);
}

DynamicMeshNode.prototype._ctor = function()
{
	SceneNode.prototype._ctor.call(this);

	this.vertices = [];
	this.normals = [];
	this.coords = [];
	this.indices = [];

	var size = 1024;
	this._vertices_data = new Float32Array( size * 3 );
	this._normals_data = null;
	this._coords_data = null;
	this._indices_data = null;
	this._total = 0;
	this._total_indices = 0;
	this._mesh = GL.Mesh.load({ vertices: this._vertices_data });
}

DynamicMeshNode.prototype.updateVertices = function( vertices )
{
	if(vertices)
		this.vertices = vertices;
	this._total = this.vertices.length;
	if( this._vertices_data.length < this.vertices.length )
	{
		this._vertices_data = new Float32Array( this.vertices.length * 2 );
		this._mesh.getBuffer("vertices").data = this._vertices_data;
	}
	this._vertices_data.set( this.vertices );
	this._mesh.getBuffer("vertices").upload( GL.STREAM_DRAW );
}

DynamicMeshNode.prototype.updateNormals = function( normals )
{
	if(normals)
		this.normals = normals;
	if( !this._normals_data || this._normals_data.length < this.normals.length )
	{
		this._normals_data = new Float32Array( this.normals.length * 2 );
		var buffer = this._mesh.getBuffer("normals");
		if(!buffer)
			this._mesh.createVertexBuffer("normals",null,3,this._normals_data, GL.STREAM_DRAW);
	}
	this._normals_data.set( this.normals );
	this._mesh.getBuffer("normals").upload( GL.STREAM_DRAW );
}

DynamicMeshNode.prototype.updateCoords = function( coords )
{
	if(coords)
		this.coords = coords;
	if( !this._coords_data || this._coords_data.length < this.normals.length )
	{
		this._coords_data = new Float32Array( this.coords.length * 2 );
		var buffer = this._mesh.getBuffer("coords");
		if(!buffer)
			this._mesh.createVertexBuffer("coords",null,2,this._coords_data, GL.STREAM_DRAW);
	}
	this._coords_data.set( this.coords );
	this._mesh.getBuffer("coords").upload( GL.STREAM_DRAW );
}

DynamicMeshNode.prototype.updateIndices = function( indices )
{
	if(indices)
		this.indices = indices;
	if( !this._indices_data || this._indices_data.length < this.indices.length )
	{
		this._indices_data = new Float32Array( this.indices.length * 2 );
		var buffer = this._mesh.getIndexBuffer("triangles");
		if(!buffer)
			this._mesh.createIndicesBuffer( "triangles",this._indices_data, GL.STREAM_DRAW );
	}
	this._indices_data.set( this.indices );
	this._mesh.getIndexBuffer("triangles").upload( GL.STREAM_DRAW );
	this._total_indices = indices.length;
}

DynamicMeshNode.prototype.render = function( renderer, camera )
{
	if(!this._total)
		return;
	var shader = renderer.shaders[ this.shader || "flat" ];
	if(!shader)
		return;
	renderer.setModelMatrix( this._global_matrix );
	var mesh = this._mesh;
	var range = this._total_indices ? this._total_indices : this._total / 3;
	renderer.enableItemFlags( this );
	shader.uniforms( renderer._uniforms ).uniforms( this._uniforms ).drawRange( mesh, this.primitive === undefined ? GL.TRIANGLES : this.primitive, 0, range, this._total_indices ? "triangles" : null );
	renderer.disableItemFlags( this );
}

extendClass( DynamicMeshNode, SceneNode );
RD.DynamicMeshNode = DynamicMeshNode;


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
	this.size = vec2.fromValues(0,0); //size of the 
	this.sprite_pivot = RD.TOP_LEFT;
	this.blend_mode = RD.BLEND_ALPHA;
	this.flags.two_sided = true;
	this.flags.flipX = false;
	this.flags.flipY = false;
	this.flags.pixelated = false;
	//this.flags.depth_test = false;
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
//num is the number of elements per row and column, if array then [columns,rows]
Sprite.createFrames = function( num, names, frames )
{
	frames = frames || {};
	var num_rows;
	var num_colums;
	if(num.constructor != Number)
	{
		num_columns = num[0];
		num_rows = num[1];
	}
	else
		num_rows = num_columns = num;

	var x = 0;
	var y = 0;
	var offsetx = 1/num_columns;
	var offsety = 1/num_rows;
	var total = num_columns * num_rows;

	if(!names)
	{
		names = [];
		for(var i = 0; i < total; ++i)
			names.push( String(i) );
	}

	for( var i = 0; i < names.length; ++i )
	{
		frames[ names[i] ] = { pos:[x,y], size:[offsetx,offsety], normalized: true };
		x += offsetx;
		if(x >= 1)
		{
			x = 0;
			y += offsety;
		}
		if(y >= 1)
			return frames;
	}
	return frames;
}

Sprite.prototype.createFrames = function(num, names)
{
	Sprite.createFrames(num, names, this.frames );
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
				if(tex && that.size[0] == 0 && that.size[0] == 0 )
					that.setSize( tex.width, tex.height );	
			});
		texture = gl.textures[ "white" ];
	}
	if(!texture) //texture not found
		return false;
		
	//adapt texture matrix
	var matrix = this.texture_matrix;
		
	var frame = this.current_frame = this.frames[ this.frame ];
	
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

	//this autoloads
	if(!this.updateTextureMatrix(renderer)) //texture or frame not found
		return;

	var tex = renderer.textures[ this.texture ];
	if(!tex)
		return;
	
	if( this.flags.pixelated )
	{
		tex.bind(0);
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.flags.pixelated ? gl.NEAREST : gl.LINEAR );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.flags.pixelated ? gl.NEAREST_MIPMAP_NEAREST : gl.LINEAR_MIPMAP_LINEAR );
	}

	if(this.billboard_mode)
		RD.orientNodeToCamera( this.billboard_mode, this, camera, renderer );
	if(this.size[0] == 0 && tex.ready !== false)
		this.size[0] = tex.width;
	if(this.size[1] == 0 && tex.ready !== false)
		this.size[1] = tex.height;
	var size = this.size;
	var offsetx = 0;
	var offsety = 0;
	temp_mat4.set( this._global_matrix );

	var normalized_size = false;
	if(this.current_frame && this.current_frame.size)
	{
		size = this.current_frame.size;
		normalized_size = this.current_frame.normalized;
	}

	if (this.sprite_pivot)
	{
		switch( this.sprite_pivot )
		{
			//case RD.CENTER: break;
			case RD.TOP_LEFT: offsetx = 0.5; offsety = -0.5; break;
			case RD.TOP_CENTER: offsety = -0.5; break;
			case RD.TOP_RIGHT: offsetx = -0.5; break;
			case RD.BOTTOM_LEFT: offsetx = 0.5; offsety = 0.5; break;
			case RD.BOTTOM_CENTER: offsety = 0.5; break;
			case RD.BOTTOM_RIGHT: offsetx = -0.5; offsety = 0.5; break;
		}
		mat4.translate( temp_mat4, temp_mat4, [offsetx * tex.width * size[0], offsety * tex.height * size[1], 0 ] );
	}
	
	//mat4.scale( temp_mat4, temp_mat4, [size[0] * (normalized_size ? this.size[0] : 1), size[1] * (normalized_size ? this.size[1] : 1), 1 ] );
	if(normalized_size)
		mat4.scale( temp_mat4, temp_mat4, [tex.width * size[0], tex.height * size[1], 1 ] );
		//mat4.scale( temp_mat4, temp_mat4, [this.size[0] * size[0], this.size[1] * size[1], 1 ] );
	else
		mat4.scale( temp_mat4, temp_mat4, [this.size[0], this.size[1], 1 ] );
	renderer.setModelMatrix( temp_mat4 );

	renderer.renderNode( this, renderer, camera );
}

/*
Sprite.renderSprite = function( renderer, camera, position, texture, frame_index, atlas_size, scale, billboard_mode, pivot )
{
	if(!texture)
		return;	

	//this autoloads
	if(!this.updateTextureMatrix(renderer)) //texture or frame not found
		return;

	if(billboard_mode)
		RD.orientNodeToCamera( billboard_mode, this, camera, renderer );

	var offsetx = 0;
	var offsety = 0;
	temp_mat4.set( this._global_matrix );

	if (pivot)
	{
		switch( pivot )
		{
			//case RD.CENTER: break;
			case RD.TOP_LEFT: offsetx = 0.5; offsety = -0.5; break;
			case RD.TOP_CENTER: offsety = -0.5; break;
			case RD.TOP_RIGHT: offsetx = -0.5; break;
			case RD.BOTTOM_LEFT: offsetx = 0.5; offsety = 0.5; break;
			case RD.BOTTOM_CENTER: offsety = 0.5; break;
			case RD.BOTTOM_RIGHT: offsetx = -0.5; offsety = 0.5; break;
		}
		mat4.translate( temp_mat4, temp_mat4, [offsetx * w, offsety * h, 0 ] );
	}
	renderer.setModelMatrix( temp_mat4 );
	renderer.renderNode( this, renderer, camera );
}
*/

extendClass( Sprite, SceneNode );
RD.Sprite = Sprite;



function Skybox(o)
{
	SceneNode.prototype._ctor.call(this,o);
	this._ctor();
	if(o)
		this.configure(o);
}

Skybox.prototype._ctor = function()
{
	this.mesh = "cube";
	this.shader = "skybox";
	this.scaling = [10,10,10];
	this.flags.depth_test = false;
	this.flags.two_sided = true;
}

Skybox.prototype.render = function( renderer, camera )
{
	this.position = camera.position;
	this.updateGlobalMatrix(true);
	renderer.setModelMatrix( this._global_matrix );
	renderer.renderNode( this, camera );
}

extendClass( Skybox, SceneNode );
RD.Skybox = Skybox;


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
	//adds code for skinning
	var skinning = "";
	var skinning_vs = "";
	if(RD.Skeleton)
	{	
		skinning = "\n\
		#ifdef SKINNING\n\
			" + RD.Skeleton.shader_code + "\n\
		#endif\n\
		";
		skinning_vs = "\n\
		#ifdef SKINNING\n\
			computeSkinning(v_pos,v_normal);\n\
		#endif\n\
		";
	}

	var vertex_shader = this._vertex_shader = "\
				precision highp float;\n\
				attribute vec3 a_vertex;\n\
				attribute vec3 a_normal;\n\
				attribute vec2 a_coord;\n\
				varying vec3 v_pos;\n\
				varying vec3 v_normal;\n\
				varying vec2 v_coord;\n\
				"+skinning+"\n\
				#ifdef INSTANCING\n\
					attribute mat4 u_model;\n\
				#else\n\
					uniform mat4 u_model;\n\
				#endif\n\
				uniform mat4 u_viewprojection;\n\
				void main() {\n\
					v_pos = a_vertex;\n\
					v_normal = a_normal;\n\
					"+skinning_vs+"\n\
					v_pos = (u_model * vec4(v_pos,1.0)).xyz;\n\
					v_normal = (u_model * vec4(v_normal,0.0)).xyz;\n\
					v_coord = a_coord;\n\
					gl_Position = u_viewprojection * vec4( v_pos, 1.0 );\n\
					gl_PointSize = 2.0;\n\
				}\
				";
		
	var fragment_shader = this._flat_fragment_shader = '\
				precision highp float;\
				uniform vec4 u_color;\
				void main() {\
				  gl_FragColor = u_color;\
				}\
	';

	gl.shaders["flat"] = this._flat_shader = new GL.Shader( vertex_shader, fragment_shader );
	gl.shaders["flat_instancing"] = this._flat_instancing_shader = new GL.Shader(vertex_shader, fragment_shader, { INSTANCING:"" });
	gl.shaders["flat_skinning"] = this._flat_skinning_shader = new GL.Shader( vertex_shader, fragment_shader, {SKINNING:""} );
	
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

	var fragment_shader = '\
		precision highp float;\
		varying vec2 v_coord;\
		uniform vec4 u_color;\n\
		#ifdef ALBEDO\n\
			uniform sampler2D u_albedo_texture;\n\
		#else\n\
			uniform sampler2D u_color_texture;\n\
		#endif\n\
		uniform float u_global_alpha_clip;\n\
		void main() {\n\
			#ifdef ALBEDO\n\
				vec4 color = u_color * texture2D(u_albedo_texture, v_coord);\n\
			#else\n\
				vec4 color = u_color * texture2D(u_color_texture, v_coord);\n\
			#endif\n\
			if(color.w < u_global_alpha_clip)\n\
				discard;\n\
			gl_FragColor = color;\
		}\
	';
	
	gl.shaders["texture"] = this._texture_shader = new GL.Shader( vertex_shader, fragment_shader );
	gl.shaders["texture_albedo"] = this._texture_albedo_shader = new GL.Shader( vertex_shader, fragment_shader, { ALBEDO:"" } );
	gl.shaders["texture_instancing"] = this._texture_instancing_shader = new GL.Shader( vertex_shader, fragment_shader, { INSTANCING:"" } );
	gl.shaders["texture_albedo_instancing"] = this._texture_albedo_instancing_shader = new GL.Shader( vertex_shader, fragment_shader, { ALBEDO:"",INSTANCING:""  } );

	if(RD.Skeleton)
		gl.shaders["texture_skinning"] = this._texture_skinning_shader = new GL.Shader( vertex_shader, fragment_shader, { SKINNING:"" } );

	this._texture_transform_shader = new GL.Shader('\
		precision highp float;\n\
		attribute vec3 a_vertex;\n\
		attribute vec2 a_coord;\n\
		varying vec2 v_coord;\n\
		uniform mat4 u_mvp;\n\
		uniform mat3 u_texture_matrix;\n\
		void main() {\n\
			v_coord = (u_texture_matrix * vec3(a_coord,1.0)).xy;\n\
			gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			gl_PointSize = 5.0;\n\
		}\n\
		', '\n\
		precision highp float;\n\
		varying vec2 v_coord;\n\
		uniform vec4 u_color;\n\
		uniform float u_global_alpha_clip;\n\
		uniform sampler2D u_color_texture;\n\
		void main() {\n\
			vec4 color = u_color * texture2D(u_color_texture, v_coord);\n\
			if(color.w < u_global_alpha_clip)\n\
				discard;\n\
			gl_FragColor = color;\n\
		}\
	');
	gl.shaders["texture_transform"] = this._texture_transform_shader;
	
	//basic phong shader
	this._phong_uniforms = { u_ambient: vec3.create(), u_light_vector: vec3.fromValues(0.5442, 0.6385, 0.544), u_light_color: RD.WHITE };

	var fragment_shader = this._fragment_shader = '\
			precision highp float;\n\
			varying vec3 v_normal;\n\
			varying vec2 v_coord;\n\
			uniform vec3 u_ambient;\n\
			uniform vec3 u_light_color;\n\
			uniform vec3 u_light_vector;\n\
			uniform vec4 u_color;\n\
			#ifdef TEXTURED\n\
				uniform sampler2D u_color_texture;\n\
			#endif\n\
			#ifdef UNIFORMS\n\
				UNIFORMS\n\
			#endif\n\
			void main() {\n\
				vec4 color = u_color;\n\
				#ifdef TEXTURED\n\
					color *= texture2D( u_color_texture, v_coord );\n\
				#endif\n\
				vec3 N = normalize(v_normal);\n\
				float NdotL = max(0.0, dot(u_light_vector,N));\n\
				#ifdef EXTRA\n\
					EXTRA\n\
				#endif\n\
				gl_FragColor = color * (vec4(u_ambient,1.0) + NdotL * vec4(u_light_color,1.0));\n\
			}\
	'
	
	gl.shaders["phong"] = this._phong_shader = new GL.Shader( vertex_shader, fragment_shader );
	this._phong_shader._uniforms = this._phong_uniforms;
	this._phong_shader.uniforms( this._phong_uniforms );

	gl.shaders["phong_instancing"] = this._phong_instancing_shader = new GL.Shader( vertex_shader, fragment_shader, { INSTANCING: "" } );
	this._phong_instancing_shader._uniforms = this._phong_uniforms;
	this._phong_instancing_shader.uniforms( this._phong_uniforms );

	gl.shaders["textured_phong"] = this._textured_phong_shader = new GL.Shader( vertex_shader, fragment_shader, { TEXTURED: "" } );
	this._textured_phong_shader.uniforms( this._phong_uniforms );
	
	gl.shaders["textured_phong_instancing"] = this._textured_phong_instancing_shader = new GL.Shader( vertex_shader, fragment_shader, { INSTANCING: "", TEXTURED: "" } );
	this._textured_phong_instancing_shader.uniforms( this._phong_uniforms );

	var fragment_shader = '\
			precision highp float;\n\
			varying vec3 v_normal;\n\
			void main() {\n\
				gl_FragColor = vec4( normalize(v_normal),1.0);\n\
			}\
	'
	gl.shaders["normal"] = this._normal_shader = new GL.Shader( vertex_shader, fragment_shader );

	var fragment_shader = '\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				gl_FragColor = vec4(v_coord,0.0,1.0);\n\
			}\
	'
	gl.shaders["uvs"] = this._uvs_shader = new GL.Shader( vertex_shader, fragment_shader );

}

//****************************

RD.orientNodeToCamera = function( mode, node, camera, renderer )
{
	if(!mode)
		return;

	if( mode == RD.BILLBOARD_CYLINDRIC || mode == RD.BILLBOARD_PARALLEL_CYLINDRIC )
	{
		var global_pos = null;
		if(mode == RD.BILLBOARD_CYLINDRIC)
		{
			global_pos = node.getGlobalPosition( temp_vec3b );
			vec3.sub(temp_vec3, camera._position, global_pos);
			temp_vec2[0] = temp_vec3[0];
			temp_vec2[1] = temp_vec3[2];
		}
		else //BILLBOARD_PARALLEL_CYLINDRIC
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
		if( mode == RD.BILLBOARD_PARALLEL_SPHERIC )
		{
			node._global_matrix.set( camera._model_matrix );
			mat4.setTranslation( node._global_matrix, node._position );
			mat4.scale( node._global_matrix, node._global_matrix, node._scale );
		}
		else //BILLBOARD_SPHERIC
		{
			mat4.lookAt( node._global_matrix, node._position, camera.position, RD.UP );
			mat4.invert( node._global_matrix, node._global_matrix );
			mat4.scale( node._global_matrix, node._global_matrix, node._scale );
		}
	}
	
	renderer.setModelMatrix( node._global_matrix );
}


RD.readPixels = function( url, on_complete )
{
	var image = new Image();
	image.src = url;
	image.onload = function(){
		var canvas = document.createElement("canvas");
		canvas.width = this.width;
		canvas.height = this.height;
		var ctx = canvas.getContext("2d");
		ctx.drawImage( this, 0 ,0 );
		var data = ctx.getImageData(0,0,canvas.width,canvas.height);
		on_complete(data,this);
	}
};

//in case litegl is not installed, Rendeer could still be useful
if(typeof(GL) == "undefined")
{
	mat4.rotateVec3 = function(out, m, a) {
		var x = a[0], y = a[1], z = a[2];
		out[0] = m[0] * x + m[4] * y + m[8] * z;
		out[1] = m[1] * x + m[5] * y + m[9] * z;
		out[2] = m[2] * x + m[6] * y + m[10] * z;
		return out;
	};

	mat4.projectVec3 = function(out, m, a)
	{
		var ix = a[0];
		var iy = a[1];
		var iz = a[2];

		var ox = m[0] * ix + m[4] * iy + m[8] * iz + m[12];
		var oy = m[1] * ix + m[5] * iy + m[9] * iz + m[13];
		var oz = m[2] * ix + m[6] * iy + m[10] * iz + m[14];
		var ow = m[3] * ix + m[7] * iy + m[11] * iz + m[15];

		out[0] = (ox / ow + 1) / 2;
		out[1] = (oy / ow + 1) / 2;
		out[2] = (oz / ow + 1) / 2;
		return out;
	};
}

//footer

})( typeof(window) != "undefined" ? window : (typeof(self) != "undefined" ? self : global ) );

//main namespace
(function(global){


/* This file includes
 * PointCloud: to render points
 * ParticleEmissor: to render basic particles
 * Billboard: to render screen aligned plane
 * SpritesBatch

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

extendClass( PointCloud, RD.SceneNode );
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
	if(this.num_textures > 0)
	{
		this._uniforms.u_texture_info[0] = 1 / this.num_textures;
		this._uniforms.u_texture_info[1] = this.num_textures * this.num_textures;
	}
	else
		this._uniforms.u_texture_info[0] = 0;
	
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
		vertices.set( p.pos ? p.pos : p, pos );
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

extendClass( ParticlesEmissor, RD.SceneNode );
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

/**
* Billboard class to hold an scene item, used for camera aligned objects
* @class Billboard
* @constructor
*/
function Billboard()  
{
	this._ctor();
}

extendClass( Billboard, RD.SceneNode );
RD.Billboard = Billboard;

Billboard.SPHERIC = 1;
Billboard.PARALLEL_SPHERIC = 2;
Billboard.CYLINDRIC = 3;
Billboard.PARALLEL_CYLINDRIC = 4;

Billboard.prototype._ctor = function()
{
	this.billboard_mode = Billboard.SPHERIC;
	this.auto_orient = true;
	RD.SceneNode.prototype._ctor.call(this);
}

Billboard.prototype.render = function(renderer, camera )
{
	//avoid orienting if it is not visible
	if(this.flags.visible === false)
		return;
	if(this.auto_orient)
		RD.orientNodeToCamera( this.billboard_mode, this, camera, renderer );
	renderer.renderNode( this, renderer, camera );
}

/**
* To render several sprites from a texture atlas
* It can be used as a scene node or a helper class
* @class SpritesBatch
* @constructor
*/
function SpritesBatch(o)
{
	this._ctor();
	if(o)
		this.configure(o);
}

SpritesBatch.prototype._ctor = function()
{
	RD.SceneNode.prototype._ctor.call(this);

	this.size = 1; //world units 
	this._atlas_size = vec2.fromValues(1,1); //num columns and rows in the spritebatch atlas
	this.max_sprites = 1024;
	this.positions = new Float32Array(this.max_sprites*3); //positions
	this.sprite_info = new Float32Array(this.max_sprites*4); //sprite info [ frame, flipx, scale, extra_num ]
	this.index = 0;
	this.shader = null;
	this.use_points = false;
	this.mode = SpritesBatch.CYLINDRICAL;
	this.must_update_buffers = true;
}

RD.SpritesBatch = SpritesBatch;

SpritesBatch.XY = 0;
SpritesBatch.XZ = 1;
SpritesBatch.CYLINDRICAL = 2;
SpritesBatch.SPHERICAL = 3;
SpritesBatch.FLAT = 4;

Object.defineProperty( SpritesBatch.prototype, "atlas_size",{
	get: function(){return this._atlas_size;},
	set: function(v){this._atlas_size.set(v);}
});

SpritesBatch.prototype.clear = function()
{
	this.index = 0;
}

//adds one sprite, 
SpritesBatch.prototype.add = function( position, frame, flipx, scale, extra_num )
{
	if( this.max_sprites <= this.index )
	{
		console.warn("too many sprites in batch, increase size");
		return;
	}
	var index = this.index;
	this.index += 1;
	this.positions.set( position, index*3 );
	if( position.length == 2 )
		this.positions[index*3+2] = 0;
	var i = index*4;
	this.sprite_info[i] = frame || 0;
	this.sprite_info[i+1] = flipx ? 1 : 0;
	this.sprite_info[i+2] = scale == null ? 1 : scale;
	this.sprite_info[i+3] = extra_num || 0;
	this.must_update_buffers = true;
}

SpritesBatch.prototype.addData = function( pos, extra )
{
	if( this.max_sprites <= this.index )
	{
		console.warn("too many sprites in batch, increase size");
		return;
	}
	var index = this.index;
	this.index += 1;
	this.positions.set( pos, index*3 );
	this.sprite_info.set( extra, index*4 );
	this.must_update_buffers = true;
}

SpritesBatch.prototype.render = function(renderer, camera)
{
	if(!this.texture)
		return;	

	var tex = renderer.textures[ this.texture ];
	if(tex && this.flags.pixelated )
	{
		tex.bind(0);
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.flags.pixelated ? gl.NEAREST : gl.LINEAR );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.flags.pixelated ? gl.NEAREST_MIPMAP_NEAREST : gl.LINEAR_MIPMAP_LINEAR );
	}

	this.renderSprites( tex, camera, this.size, this.atlas_size, this.color, this.mode );
}

//mode allows to orient them
SpritesBatch.prototype.renderSprites = function( texture, camera, size, atlas_size, color, mode )
{
	if(!this.index) //no sprites
		return;

	var shader = gl.shaders[ this.shader ];

	if(!shader)
		shader = gl.shaders[ this.use_points ? "point_sprites" : "quad_sprites" ];

	if(!shader)
	{
		if(this.use_points)
			shader = gl.shaders[ "point_sprites" ] = new GL.Shader( SpritesBatch.point_sprites_vertex_shader, SpritesBatch.point_sprites_fragment_shader );
		else
			shader = gl.shaders[ "quad_sprites" ] = new GL.Shader( SpritesBatch.quad_sprites_vertex_shader, SpritesBatch.quad_sprites_fragment_shader );
	}

	mode = mode || 0;

	if( this.use_points )
	{
		shader.uniforms( GFX.scene_renderer._uniforms );
		shader.setUniform( "u_pointSize", size );
		shader.setUniform( "u_atlas", atlas_size );
		shader.setUniform( "u_texture", texture.bind(0) );
		RD.renderPoints( this.positions, this.sprite_info, camera, this.index, shader );
		return;
	}

	//using quads
	if(!this.vertex_buffer_data)
	{
		this.vertex_buffer_data = new Float32Array( this.max_sprites * 3 * 4 ); //4 vertex per quad
		this.extra4_buffer_data = new Float32Array( this.max_sprites * 4 * 4 ); //4 vertex per quad
		var extra2_data = new Int8Array( this.max_sprites * 2 * 4 ); //for inflation direction, could be shared among spritesheets
		var quad_data = new Int8Array([-1,1, 1,1, -1,-1, 1,-1]);
		for(var i = 0; i < extra2_data.length; i += 8 )
			extra2_data.set( quad_data, i );
		var indices_data = new Int16Array([0,2,1, 1,2,3]);
		var indices_buffer_data = new Uint16Array( this.max_sprites * 3 * 2); //3 indices, 2 triangles
		for(var i = 0; i < indices_buffer_data.length; ++i )
			indices_buffer_data[i] = indices_data[i%6] + Math.floor(i/6)*4;
		this.vertex_buffer = new GL.Buffer( gl.ARRAY_BUFFER, this.vertex_buffer_data, 3, gl.DYNAMIC_DRAW );
		this.extra4_buffer = new GL.Buffer( gl.ARRAY_BUFFER, this.extra4_buffer_data, 4, gl.DYNAMIC_DRAW );
		this.extra2_buffer = new GL.Buffer( gl.ARRAY_BUFFER, extra2_data, 2, gl.STATIC_DRAW );
		this.indices_buffer = new GL.Buffer( gl.ELEMENT_ARRAY_BUFFER, indices_buffer_data, 1, gl.STATIC_DRAW );
	}

	if( this.must_update_buffers )
	{
		var vertices = this.vertex_buffer_data;
		var extra4 = this.extra4_buffer_data;
		var end = Math.min( this.index, this.positions.length / 3);
		for(var i = 0, l = end; i < l; ++i )
		{
			var index = i*3;
			var pos = this.positions.subarray( index, index + 3 );
			vertices.set( pos, index*4 );
			vertices.set( pos, index*4 + 3 );
			vertices.set( pos, index*4 + 6 );
			vertices.set( pos, index*4 + 9 );
			var index = i*4;
			var info = this.sprite_info.subarray( index, index + 4 );
			extra4.set( info, index*4 );
			extra4.set( info, index*4 + 4 );
			extra4.set( info, index*4 + 8 );
			extra4.set( info, index*4 + 12 );
		}

		//upload subarray
		this.vertex_buffer.uploadRange(0, this.index * 3 * 4 * 4 );
		this.extra4_buffer.uploadRange(0, this.index * 4 * 4 * 4 );
		//this.vertex_buffer.upload();
		//this.extra4_buffer.upload();
		this.must_update_buffers = false;
	}

	var frame_width = (texture.width / atlas_size[0]);
	var frame_height = (texture.height / atlas_size[1]);
	var aspect = frame_width / frame_height;

	var top = RD.UP;
	var right = RD.RIGHT;

	switch( mode )
	{
		case RD.SpritesBatch.SPHERICAL: top = camera.getLocalVector( RD.UP ); //break not missing
		case RD.SpritesBatch.CYLINDRICAL: right = camera.getLocalVector( RD.RIGHT ); break;
		case RD.SpritesBatch.FLAT: top = camera.getLocalVector( RD.FRONT ); right = camera.getLocalVector( RD.RIGHT ); break;
		case RD.SpritesBatch.XZ: top = RD.FRONT; break;
	};

	//render
	shader.bind();
	shader.setUniform("u_model", RD.IDENTITY );
	shader.setUniform("u_viewprojection", camera._viewprojection_matrix );
	shader.setUniform("u_color", color || RD.ONES4 );
	shader.setUniform("u_size", [size, size / aspect] );
	shader.setUniform("u_top", top );
	shader.setUniform("u_right", right );
	shader.setUniform( "u_atlas", atlas_size );
	shader.setUniform( "u_texture", texture.bind(0) );
	shader.setUniform( "u_itexsize", [ 1 / texture.width, 1 / texture.height ] );
	shader.setUniform( "u_viewport", gl.viewport_data );

	var loc1 = shader.attributes["a_vertex"];
	var loc2 = shader.attributes["a_extra4"];
	var loc3 = shader.attributes["a_extra2"];
	this.vertex_buffer.bind( loc1 );
	this.extra4_buffer.bind( loc2 );
	this.extra2_buffer.bind( loc3 );
	gl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, this.indices_buffer.buffer );
	gl.drawElements( gl.TRIANGLES, this.index * 6, gl.UNSIGNED_SHORT, 0);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
	this.vertex_buffer.unbind( loc1 );
	this.extra4_buffer.unbind( loc2 );
	this.extra2_buffer.unbind( loc3 );
}


extendClass( SpritesBatch, RD.SceneNode );


SpritesBatch.quad_sprites_vertex_shader = "\n\
precision highp float;\n\
attribute vec3 a_vertex;\n\
attribute vec4 a_extra4; //frame,flipx,scale,extranum\n\
attribute vec2 a_extra2;//expanse direction\n\
varying vec3 v_pos;\n\
varying vec2 v_uv;\n\
varying vec4 v_color;\n\
uniform mat4 u_model;\n\
uniform mat4 u_viewprojection;\n\
uniform vec4 u_viewport;\n\
uniform vec2 u_size;\n\
uniform vec3 u_top;\n\
uniform vec3 u_right;\n\
uniform vec4 u_color;\n\
uniform vec2 u_atlas;\n\
uniform vec2 u_itexsize;\n\
\n\
void main() {\n\
	vec3 vertex = a_vertex + a_extra4.z * u_size.y * u_top * a_extra2.y + a_extra4.z * u_size.x * u_right * a_extra2.x;\n\
	vec2 uv = a_extra2;\n\
	if( a_extra4.y != 0.0) //flip X\n\
		uv.x *= -1.0;\n\
	uv.x *= 1.0 - u_itexsize.x;\n\
	uv.y *= -1.0;\n\
	uv = uv * 0.5 + vec2(0.5);\n\
	\n\
	vec2 i_atlas = vec2(1.0) / u_atlas; \n\
	float frame = a_extra4.x;\n\
	float frame_x = mod( frame, u_atlas.x );\n\
	float frame_y = floor( frame * i_atlas.x );\n\
	uv.x = (uv.x + frame_x) * i_atlas.x;\n\
	uv.y += frame_y;\n\
	uv.y = 1.0 - uv.y * i_atlas.y;\n\
	v_uv = uv;\n\
	v_pos = (u_model * vec4(vertex,1.0)).xyz;\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
	//gl_Position.x = floor(gl_Position.x * u_viewport.z * 1.0) / (u_viewport.z * 1.0);\n\
	//gl_Position.y = floor(gl_Position.y * u_viewport.w * 1.0) / (u_viewport.w * 1.0);\n\
}\n\
\n\
";

SpritesBatch.quad_sprites_fragment_shader = "\n\
precision highp float;\n\
precision mediump int;\n\
\n\
varying vec3 v_pos;\n\
varying vec2 v_uv;\n\
uniform vec4 u_color;\n\
uniform sampler2D u_texture;\n\
\n\
void main() {\n\
	vec4 color = texture2D( u_texture, v_uv );\n\
	if(color.a < 0.1)\n\
		discard;\n\
	color *= u_color;\n\
	gl_FragColor = color;\n\
}\n\
";

SpritesBatch.point_sprites_vertex_shader = "\n\
precision highp float;\n\
attribute vec3 a_vertex;\n\
attribute vec4 a_extra4;\n\
varying vec3 v_pos;\n\
varying vec3 v_wPos;\n\
varying vec4 v_extra4;\n\
uniform mat4 u_model;\n\
uniform mat4 u_mvp;\n\
uniform vec4 u_viewport;\n\
uniform float u_camera_perspective;\n\
uniform float u_pointSize;\n\
\n\
float computePointSize( float radius, float w )\n\
{\n\
	if(radius < 0.0)\n\
		return -radius;\n\
	return u_viewport.w * u_camera_perspective * radius / w;\n\
}\n\
\n\
void main() {\n\
	vec3 vertex = a_vertex;	\n\
	v_pos = vertex;\n\
	v_wPos = (u_model * vec4(vertex,1.0)).xyz;\n\
	v_extra4 = a_extra4;\n\
	gl_Position = u_mvp * vec4(vertex,1.0);\n\
	gl_Position.x = floor(gl_Position.x * u_viewport.z) / u_viewport.z;\n\
	gl_Position.y = floor(gl_Position.y * u_viewport.w) / u_viewport.w;\n\
	gl_PointSize = computePointSize( u_pointSize * u_extra4.z, gl_Position.w );\n\
}\n\
";

SpritesBatch.point_sprites_fragment_shader = "\n\
precision highp float;\n\
varying vec3 v_pos;\n\
varying vec3 v_wPos;\n\
varying vec4 v_extra4; //id,flip,scale,extra\n\
uniform float u_atlas;\n\
\n\
uniform sampler2D u_texture;\n\
\n\
void main() {\n\
	float i_atlas = 1.0 / u_atlas;\n\
	float frame = v_extra4.x;\n\
	float x = frame * i_atlas;\n\
	float y = floor(x);\n\
	x = (x - y);\n\
	y = y / u_atlas;\n\
	if( v_extra4.y > 0.0 ) //must flip in x\n\
		x -= gl_PointCoord.x * i_atlas - i_atlas;\n\
	else\n\
		x += gl_PointCoord.x * i_atlas;\n\
	\n\
	vec2 uv = vec2( x, 1.0 - (y + gl_PointCoord.y / u_atlas) );\n\
	vec4 color = texture2D( u_texture, uv );\n\
	if(color.a < 0.1)\n\
		discard;\n\
	gl_FragColor = color;\n\
}\n\
";


//footer
})( typeof(window) != "undefined" ? window : (typeof(self) != "undefined" ? self : global ) );

(function(global){

function Gizmo(o)
{
	this._ctor();
	if(o)
		this.configure(o);
	this.render_priority = 0;
	this.targets = null;
	this.size = 150; //in pixels
	this.mode = Gizmo.DEFAULT;
	this.coordinates = Gizmo.WORLD_SPACE;
	this.layers = 0xFF;
	this.grid_size = 0;
	this.allow_duplicating = true; //allow to duplicate selected nodes by shift drag
	this.render_move_plane = true; //render the plane where moving

	this.shader = "flat"; //do not change this
	this._last = vec3.create();

	var colors = {x:Gizmo.XAXIS_COLOR,y:Gizmo.YAXIS_COLOR,z:Gizmo.ZAXIS_COLOR};
	var actions = ["drag","movex","movey","movez","movexy","movexz","moveyz","scalex","scaley","scalez","scalexy","scaleyz","scalexz","rotatex","rotatey","rotatez","rotatefront","rotate","scale"];
	this.actions = {};
	for(var i in actions)
	{
		var action = actions[i];
		var info = {
			mask: 0xFF,
			pos: vec3.create(),
			pos2D: vec3.create(),
			radius: 0.15,
			visible: false,
			flag: Gizmo[action.toUpperCase()]
		};
		if(action.indexOf("move") == 0)
			info.move = true;
		if(action.indexOf("rotate") == 0)
			info.rotate = true;
		if(action.indexOf("scale") == 0)
			info.scale = true;
		info.color = colors[ action[ action.length - 1] ];
		if(info.move || info.rotate)
			info.cursor = "crosshair";
		this.actions[ action ] = info;		
	}

	this.actions["scalex"].axis = this.actions["rotatex"].axis = this.actions["movex"].axis = vec3.fromValues(1,0,0);
	this.actions["scaley"].axis = this.actions["rotatey"].axis = this.actions["movey"].axis = vec3.fromValues(0,1,0);
	this.actions["scalez"].axis = this.actions["rotatez"].axis = this.actions["movez"].axis = vec3.fromValues(0,0,1);
	this.actions["movexy"].normal = this.actions["scalexy"].normal = vec3.fromValues(0,0,1);
	this.actions["movexz"].normal = this.actions["scalexz"].normal = vec3.fromValues(0,1,0);
	this.actions["moveyz"].normal = this.actions["scaleyz"].normal = vec3.fromValues(1,0,0);
	this.actions["movexy"].radius = this.actions["movexz"].radius = this.actions["moveyz"].radius = 0.1;
	this.actions["scalexy"].radius = this.actions["scalexz"].radius = this.actions["scaleyz"].radius = 0.1;
	this.actions["drag"].cursor = "move";
	this.actions["scale"].cursor = "row-resize";
	//this.actions["scale"].radius = 0.3;

	this.click_model = mat4.create();
	this.click_transform = new Float32Array(10);
	this.click_pos = vec3.create();
	this.click_2D = vec3.create();
	this.click_2D2 = vec3.create();
	this.click_2D_norm = vec3.create();
	this.center_2D = vec3.create();
	this.click_dist = 1;
}

Gizmo.MOVEX = 1<<0;
Gizmo.MOVEY = 1<<1;
Gizmo.MOVEZ = 1<<2;
Gizmo.MOVEXY = 1<<3;
Gizmo.MOVEXZ = 1<<4;
Gizmo.MOVEYZ = 1<<5;
Gizmo.ROTATEX = 1<<6;
Gizmo.ROTATEY = 1<<7;
Gizmo.ROTATEZ = 1<<8;
Gizmo.SCALEX = 1<<9;
Gizmo.SCALEY = 1<<10;
Gizmo.SCALEZ = 1<<11;
Gizmo.SCALEXY = 1<<12;
Gizmo.SCALEYZ = 1<<13;
Gizmo.SCALEXZ = 1<<14;
Gizmo.SCALE = 1<<15;
Gizmo.DRAG = 1<<16;
Gizmo.ROTATE = 1<<17;
Gizmo.ROTATEFRONT = 1<<18;

Gizmo.MOVEAXIS = Gizmo.MOVEX | Gizmo.MOVEY | Gizmo.MOVEZ;
Gizmo.MOVEPLANAR = Gizmo.MOVEXY | Gizmo.MOVEXZ | Gizmo.MOVEYZ;
Gizmo.MOVEALL = Gizmo.DRAG | Gizmo.MOVEAXIS | Gizmo.MOVEPLANAR;
Gizmo.PLANAR = Gizmo.MOVEX | Gizmo.MOVEZ | Gizmo.MOVEXZ | Gizmo.ROTATEY | Gizmo.SCALE;
Gizmo.ROTATEALL = Gizmo.ROTATEX | Gizmo.ROTATEY | Gizmo.ROTATEZ | Gizmo.ROTATEFRONT;
Gizmo.SCALEALL = Gizmo.SCALE | Gizmo.SCALEX | Gizmo.SCALEY | Gizmo.SCALEZ | Gizmo.SCALEXY | Gizmo.SCALEYZ | Gizmo.SCALEXZ;
Gizmo.MOVEROTATESCALE = Gizmo.MOVEAXIS | Gizmo.MOVEPLANAR | Gizmo.ROTATEALL | Gizmo.SCALE;
//Gizmo.ALL = Gizmo.MOVEALL | Gizmo.ROTATEALL | Gizmo.SCALEX | Gizmo.SCALEY | Gizmo.SCALEZ;
Gizmo.ALL = Gizmo.MOVEAXIS | Gizmo.MOVEPLANAR | Gizmo.ROTATEALL | Gizmo.SCALEALL;

Gizmo.DEFAULT = Gizmo.PLANAR;

Gizmo.OBJECT_SPACE = 1;
Gizmo.WORLD_SPACE = 2;

var axisX = mat4.create();
var axisY = mat4.create();
var axisZ = mat4.create();

var rotX = mat4.create();
var rotY = mat4.create();
var rotZ = mat4.create();

var model = mat4.create();
var model_aligned = mat4.create();
var mvp = mat4.create();

var front = vec3.create();
var right = vec3.create();
var up = vec3.create();

var pos4 = vec4.create();
var pos3 = vec4.create();

mat4.translate( axisX, axisX, [1.1,0,0] );
mat4.rotate( axisX, axisX, 90 * DEG2RAD, [0,0,-1] );
mat4.translate( axisY, axisY, [0,1.1,0] );
mat4.translate( axisZ, axisZ, [0,0,1.1] );
mat4.rotate( axisZ, axisZ, 90 * DEG2RAD, [1,0,0] );
var reverse = mat4.create();
mat4.scale( reverse, reverse, [-1,-1,-1] );

Gizmo.full_viewport = null;

var tmp = mat4.create();
var tmp2 = mat4.create();

Gizmo.XAXIS_COLOR = [0.901, 0.247, 0.349,1];
Gizmo.YAXIS_COLOR = [0.55, 0.81, 0.11,1];
Gizmo.ZAXIS_COLOR = [0.23, 0.57, 0.93,1];
Gizmo.XYAXIS_COLOR = [0.9, 0.7, 0.23, 0.75];
Gizmo.XZAXIS_COLOR = [0.6, 0.4, 0.7, 0.75];
Gizmo.YZAXIS_COLOR = [0.39, 0.69, 0.52, 0.75];
Gizmo.SPHERE_COLOR = [0.8,0.8,0.8,0.4];
Gizmo.RING_COLOR = [0.5,0.5,0.5,1];
Gizmo.INNERSPHERE_COLOR = [0.6,0.6,0.6,1];
Gizmo.SELECTED_COLOR = [1,1,1,1];
Gizmo.NOAXIS_COLOR = [0.901, 0.247, 0.749,1];
Gizmo.STATIC_SPHERE_COLOR = [0.1, 0.1, 0.1,0.3];

Gizmo.prototype.isTarget = function( node )
{
	return this.targets.indexOf(node) != -1;
}

Gizmo.prototype.setTargets = function( nodes, append )
{
	if(nodes && nodes.constructor !== Array)
		throw("nodes must be an Array");

	if(!nodes || nodes.length == 0)
	{
		if(!append)
			this.targets = null;
		return
	}

	if( append && this.targets)
		nodes = this.targets.concat(nodes);
	//remove repeated ones
	nodes = nodes.filter(function(item,index){ return nodes.indexOf(item) === index });
	this.targets = nodes;
	this.resetTransform(); //remove rotation (TODO: compute average rotation?)
	this.position = this.computeCenter(this.targets);
}

Gizmo.prototype.computeCenter = function(nodes)
{
	nodes = nodes || this.targets;
	if(!nodes || !nodes.length)
		return;

	var pos = null;
	for(var i = 0; i < nodes.length; ++i)
	{
		var n = nodes[i];
		if(!(n.layers & this.layers))
			continue;
		var gpos = n.getGlobalPosition();
		if(!pos)
			pos = gpos;
		else
			vec3.add(pos,pos,gpos);
	}
	if(!pos)
		return [0,0,0];
	vec3.scale(pos,pos,1/nodes.length);
	return pos;
}

Gizmo.prototype.updateGizmo = function()
{
	if(!this.targets)
		return;

	if(this.targets.length == 0)
	{
		this.transform = this.targets[0].transform;
		return;
	}
	this.resetTransform();
	if(this.targets.length == 1 && this.coordinates == RD.Gizmo.OBJECT_SPACE )
	{
		this.transform = this.targets[0].transform;
	}
	else
		this.position = this.computeCenter(this.targets);
}

Gizmo.prototype.updateTargets = function()
{
	if(!this.targets)
		return;
	var gm = this.getGlobalMatrix( mat4.create() );
	for(var i = 0; i < this.targets.length; ++i)
	{
		var n = this.targets[i];
		if(!(n.layers & this.layers))
			continue;
		n.fromMatrix(gm,true);
	}
}

Gizmo.prototype.saveTargetTransforms = function()
{
	if(!this.targets)
		return;
	this.target_tranforms = [];
	for(var i = 0; i < this.targets.length; ++i)
	{
		var n = this.targets[i];
		if(!(n.layers & this.layers))
			continue;
		this.target_tranforms[i] = new Float32Array(n.transform);
	}
}

Gizmo.prototype.restoreTargetTransforms = function()
{
	if(!this.target_tranforms || !this.targets || this.target_tranforms.length != this.targets.length )
		return;

	for(var i = 0; i < this.targets.length; ++i)
	{
		var n = this.targets[i];
		if(!(n.layers & this.layers))
			continue;
		n.transform = this.target_tranforms[i];
	}
}

Gizmo.prototype.removeTargetsFromScene = function()
{
	if(!this.targets)
		return;
	for(var i = 0; i < this.targets.length; ++i)
	{
		var n = this.targets[i];
		if(!(n.layers & this.layers))
			continue;
		if(n.parentNode)
			n.parentNode.removeChild(n);
	}	
	this.targets = null;
}

Gizmo.prototype.getTargetBaseNodes = function()
{
	if(!this.targets || !this.targets.length)
		return null;
	var r = [];
	var targets = this.targets;
	for(var i = 0; i < targets.length; ++i)
	{
		var n = targets[i];
		if(!(n.layers & this.layers))
			continue;
		if(isParentSelected(n.parentNode))
			continue;
		r.push(n);
	}

	return r;

	function isParentSelected(node)
	{
		if(targets.indexOf(node) != -1)
			return true;
		if(!node.parentNode)
			return false;
		return isParentSelected(node.parentNode)
	}
}

Gizmo.prototype.applyTransformToTarget = function(transmat)
{
	var gm = this.getGlobalMatrix( mat4.create() );
	var igm = mat4.invert(mat4.create(), gm);
	var m = mat4.create();
	var targets = this.getTargetBaseNodes();
	if(!targets)
		return;

	var scaling_sign = [1,1,1];

	for(var i = 0; i < targets.length; ++i)
	{
		var n = targets[i];
		scaling_sign[0] = n.scaling[0] >= 0 ? 1 : -1;
		scaling_sign[1] = n.scaling[1] >= 0 ? 1 : -1;
		scaling_sign[2] = n.scaling[2] >= 0 ? 1 : -1;
		n.getGlobalMatrix(m); //in global
		mat4.multiply(m,igm,m); //local to gizmo
		mat4.multiply(m,transmat,m);//scaled
		mat4.multiply(m,gm,m);//back to world
		n.fromMatrix(m,true);
		vec3.mul( n._scale, n._scale, scaling_sign ); //in case it was flipped in one axis
		n.position = this.applySnap( n.position );
		if(this.grid_size) //snap
		{
			var euler = quat.toEuler(vec3.create(), n.rotation );
			euler[0] = (Math.round((euler[0] * RAD2DEG) / 15) * 15) * DEG2RAD;
			euler[1] = (Math.round((euler[1] * RAD2DEG) / 15) * 15) * DEG2RAD;
			euler[2] = (Math.round((euler[2] * RAD2DEG) / 15) * 15) * DEG2RAD;
			quat.fromEuler(n.rotation,euler);
		}
		//console.log("result",n.position);
	}

	mat4.multiply(m,gm,transmat);//back to world
	this.fromMatrix(m);
	this.scaling = [1,1,1];
	this.updateGizmo();
}

Gizmo.prototype.applyTranslation = function(d)
{
	var transmat = mat4.create();
	mat4.translate(transmat,transmat,d);
	this.applyTransformToTarget(transmat);
}

Gizmo.prototype.applyRotation = function(angle, axis)
{
	var transmat = mat4.create();
	mat4.rotate(transmat,transmat, angle, axis );
	this.applyTransformToTarget(transmat);
}

Gizmo.prototype.applyScale = function(s)
{
	if(s.constructor === Number)
		s = [s,s,s];
	var transmat = mat4.create();
	mat4.scale(transmat,transmat,s);
	this.applyTransformToTarget(transmat);
}

Gizmo.prototype.applySnap = function(pos)
{
	if(!this.grid_size)
		return pos;

	pos[0] = Math.round(pos[0] / this.grid_size) * this.grid_size;
	pos[1] = Math.round(pos[1] / this.grid_size) * this.grid_size;
	pos[2] = Math.round(pos[2] / this.grid_size) * this.grid_size;
	return pos;
}

Gizmo.prototype.setColor = function(color)
{
	if(!this.targets)
		return;
	for(var i = 0; i < this.targets.length; ++i)
	{
		var n = this.targets[i];
		if(!(n.layers & this.layers))
			continue;
		n.color = color;
	}	
}

Gizmo.prototype.cloneTargets = function()
{
	if(!this.allow_duplicating)
		return;

	if(this.onDuplicateTargets)
	{
		if(this.onDuplicateTargets( this.targets ))
			return;
	}

	var r = [];
	for(var i = 0; i < this.targets.length; ++i)
	{
		var t = this.targets[i];
		if(!(t.layers & this.layers))
			continue;
		var n = t.clone(true);
		t.parentNode.addChild(n);
		r.push(t);
	}
	this.targets = r;
	return r;
}

Gizmo.prototype.onMouse = function(e)
{
	if(!this._camera || !this.targets || this.visible === false)
		return;

	var camera = this._camera;
	var camfront = camera.getFront();
	var mouse = [e.canvasx, e.canvasy];
	if(document.pointerLockElement && 0)
	{
		mouse[0] += e.movementX;
		mouse[1] += e.movementY;
	}

	var ray = camera.getRay(mouse[0], mouse[1] );
	var center = this.position;
	var front = vec3.sub( vec3.create(), center, camera.position );
	vec3.normalize(front,front);
	var action = this._selected_action;
	var action_info = this.actions[action];
	var model = this._global_matrix;
	var center_2D = camera.project( center, null, this.center_2D );

	if(e.type == "mousedown")
	{
		this.click_2D[0] = this.click_2D2[0] = mouse[0];
		this.click_2D[1] = this.click_2D2[0] = mouse[1];

		//special case
		if(e.is_touch)
		{
			this.testMouseOver(e);
		}

		action = this._selected_action = this._hover_action;
		action_info = this.actions[action];
		if(action_info)
		{
			if( action_info.move && action_info.axis ) //axis move
			{
				var axis = vec3.clone(action_info.axis);
				mat4.rotateVec3(axis,model,axis);
				vec3.normalize(axis,axis);
				this._last = ray.closestPointOnRay( center, axis ); //compute axis
				if(e.shiftKey)
				{
					this.cloneTargets();
				}
			}
			else if( action_info.move && action_info.normal ) //plane move
			{
				if( ray.testPlane( center, action_info.normal ) )
					this.click_pos = ray.collision_point;
				if(e.shiftKey)
				{
					this.cloneTargets();
				}
			}
			if( action == "drag")
			{
				ray.testPlane( center, camfront );
				this._last = ray.collision_point;
				if(e.shiftKey)
					this.cloneTargets();
			}
			if( action == "rotatefront")
			{
				vec2.sub(this.click_2D,this.click_2D,this.center_2D);
				vec2.normalize(this.click_2D,this.click_2D);
				this.click_2D_norm.set( this.click_2D );
				vec2.scaleAndAdd(this.click_2D,this.center_2D,this.click_2D,this.size*0.5);
				this.click_2D2.set( this.click_2D );
			}
			else if( action_info.rotate )
			{
				if( action_info.axis ) //fixed axis
				{
					var world_axis = mat4.rotateVec3(vec3.create(),model,action_info.axis);
					if ( ray.testPlane( center, world_axis ) )
					{
						vec3.sub( this.click_pos, ray.collision_point, center );
						vec3.normalize( this.click_pos, this.click_pos );
						var circlepos = vec3.scaleAndAdd( vec3.create(), center, this.click_pos, this.current_size );
						this.click_2D = camera.project( circlepos );
						this.current_2D = this.click_2D;
					}
				}
				else if ( ray.testSphere( center, this.current_size ) ) //free axis
				{
					this._last = ray.collision_point;
					vec3.sub(this.click_pos,ray.collision_point,center);
					vec3.normalize(this.click_pos,this.click_pos);
					this.click_axis = vec3.cross( this.click_axis || vec3.create(), front, this.click_pos );
					//this.click_2D_norm.set( this.click_2D );
					//vec2.scaleAndAdd(this.click_2D,this.center_2D,this.click_2D,this.size*0.5);
				}
			}
			this.click_model.set( model );
			this.click_transform.set( this.transform );
			this.click_dist = vec3.distance( this.click_2D, this.center_2D );
			this.saveTargetTransforms();
		}
	}
	else if(e.type == "mousemove")
	{
		if(e.dragging && this._selected_action)
		{
			if( action == "rotatefront")
			{
				var v = vec2.sub(vec3.create(),mouse,this.center_2D);
				vec2.normalize(v,v);
				var v2 = this.click_2D_norm;
				vec2.scaleAndAdd( this.click_2D2, this.center_2D, v, this.size * 0.5 );
				var angle1 = Math.atan2(v[0],v[1]);  //angle current click
				var angle2 = Math.atan2(v2[0],v2[1]);  //angle original click
				var angle = angle1 - angle2; //offset
				if(e.shiftKey)
					angle = (Math.PI*2) * Math.ceil(36 * angle / (Math.PI*2)) / 36;
				//this.applyRotation(angle, front);
				//this.click_2D_norm.set(v); //update original
				if(angle)
				{
					this.restoreTargetTransforms();
					this.applyRotation( angle, front );
				}

				/*
				if(angle)
				{
					this.transform.set( this.click_transform );
					this.rotate( angle, front, true );
				}
				this.updateTarget();
				*/
				return true;
			}
			else if( action_info.rotate )
			{
				//compute angle
				if(action_info.axis)
				{
					var world_axis = mat4.rotateVec3(vec3.create(),model,action_info.axis);
					if ( ray.testPlane( center, world_axis ) )
					{
						var newpos = vec3.sub( vec3.create(), ray.collision_point, center );
						vec3.normalize( newpos,newpos );
						var circlepos = vec3.scaleAndAdd( vec3.create(), center, newpos, this.current_size );
						this.current_2D = camera.project( circlepos );
						var dot = Math.clamp( vec3.dot(newpos,this.click_pos),-1,1);
						var angle = Math.acos( dot );
						var cross = vec3.cross(vec3.create(),newpos,this.click_pos);
						vec3.normalize(cross,cross);
						var dot = vec3.dot( world_axis, cross );
						//console.log(dot);
						if( dot > 0 )
							angle *= -1;
						this.restoreTargetTransforms();
						this.applyRotation( angle, action_info.axis );
					}
				}
				else //no axis "rotate"
				{
					var axis = vec3.cross( vec3.create(), front, this.click_pos );
					var angle = (vec2.dist( this.center_2D, mouse ) - this.click_dist) * 0.01;
					var A = vec2.sub( vec2.create(), this.center_2D, mouse );
					var B = vec2.sub( vec2.create(), this.center_2D, this.click_2D );
					if( vec2.dot(A,B) < 0 )
						angle = -angle;
					console.log(angle);
					this.restoreTargetTransforms();
					this.applyRotation( angle, axis );
					this.click_axis = axis;
				}
				//this.updateTarget();
				return true;
			}

			var diff = null;
			if( action_info.move && action_info.normal ) //plane move
			{
				if( ray.testPlane( center, action_info.normal ) )
				{
					var pos = ray.collision_point;
					this.applySnap(pos);
					//console.log("expected",pos);
					diff = vec3.sub( vec3.create(), pos, this.click_pos );
					this.click_pos = pos;
				}
			}
			else if( action_info.move || action_info.scale ) //axis move and scale
			{
				if(action == "scale" || (action_info.scale && e.ctrlKey) )
				{
					var f = (1 + (mouse[1] - this.click_2D[1]) * 0.01 );
					this.applyScale(f);
					this.click_2D[0] = mouse[0];
					this.click_2D[1] = mouse[1];
					return true;
				}

				if(action == "scalexy" || action == "scalexz" || action == "scaleyz")
				{
					var f = (1 + (mouse[1] - this.click_2D[1]) * 0.01 );
					switch(action)
					{
						case "scalexy": this.applyScale([f,f,1]); break;
						case "scaleyz": this.applyScale([1,f,f]); break;
						case "scalexz": this.applyScale([f,1,f]); break;
					}

					this.click_2D[0] = mouse[0];
					this.click_2D[1] = mouse[1];
					return true;
				}

				var axis = vec3.clone(action_info.axis);
				mat4.rotateVec3(axis,model,axis);
				vec3.normalize(axis,axis);
				var closest = ray.closestPointOnRay( center, axis );
				if(action_info.scale)
				{
					//var dist = vec3.distance( closest, center );
					var dist = vec2.distance( mouse, this.center_2D );
					var ratio = dist / this.click_dist;
					if(action == "scalex")
						this.applyScale([ratio,1,1]); //this.target._scale[0] *= ratio;
					else if(action == "scaley")
						this.applyScale([1,ratio,1]); //this.target._scale[1] *= ratio;
					else if(action == "scalez")
						this.applyScale([1,1,ratio]); //this.target._scale[2] *= ratio;
					this.click_dist = dist;
					//this.target.updateMatrices();
					return true;
				}
				this.applySnap(closest);
				diff = vec3.sub( vec3.create(), closest, this._last );
				this._last = closest;
			}
			if( action == "drag")
			{
				var closest = ray.testPlane( center, this._camera.getFront() );
				var closest = ray.collision_point;
				this.applySnap(closest);
				//console.log("expected",closest);
				diff = vec3.sub( vec3.create(), closest, this._last );
				this._last = closest;
			}

			if(diff)
			{
				this.applyTranslation(diff);
				//this.applySnap(pos);
				//this.translate(diff);
				//this.updateMatrices();
				//this.updateTarget();
				return true;
			}
		}
		else //moving the mouse without click
		{
			this.testMouseOver(e);
		}
	}
	else if(e.type == "mouseup")
	{
		this.saveTargetTransforms();
		if(this._selected_action)
		{
			this._selected_action = null;
			this.render( this._last_renderer, this._last_camera ); //update gizmo positions
			this.testMouseOver(e);
			this.updateGizmo();
			return true;
		}
	}
	else if(e.type == "wheel")
	{
		if(this._selected_action == "scale")
		{
			var f = 1 + e.wheel * 0.0002;
			this.applyScale(f);
			return true;
		}

		if(this._selected_action == "drag")
		{
			var diff = vec3.sub(vec3.create(),center,camera.position);
			var f = 1 + e.wheel * 0.0002;
			vec3.scaleAndAdd(diff,camera.position,diff,f);
			vec3.sub(diff,diff,center);
			this.applyTranslation(diff);
			this._last = center;
			return true;
		}
	}

	return false;
}

Gizmo.prototype.testMouseOver = function(e)
{
	this._hover_action = null;
	var mouse = [e.canvasx,e.canvasy];
	var mindist = 100000;
	var hover = null;
	for(var i in this.actions)
	{
		var info = this.actions[i];
		if(!info.visible)
			continue;
		var pos = info.pos2D;
		var dist = vec2.distance( pos, mouse );
		if(dist < info.radius * this.size && dist < mindist)
		{
			mindist = dist;
			hover = i;
		}
	}
	if( !hover )
	{
		var disttocenter = vec2.distance( this.center_2D, mouse );
		if( this.actions.rotatefront.visible && Math.abs(disttocenter - this.size*0.5) < 10 ) //border
			hover = "rotatefront";
		else if( this.mode & Gizmo.ROTATE && disttocenter < this.size*0.5 )
			hover = "rotate";
	}
	this._hover_action = hover;
	//gl.canvas.style.cursor = "";
	//if(hover && this.actions[hover])
	//	gl.canvas.style.cursor = this.actions[hover].cursor;
	return hover;
}

Gizmo.prototype.cancel = function()
{
	if(this._selected_action)
	{
		this._selected_action = null;
		this.restoreTargetTransforms();
	}
}

//rendering ********************************

Gizmo.prototype.render = function(renderer,camera)
{
	this._last_renderer = renderer;
	this._last_camera = camera;

	//mark as not rendered
	for(var i in this.actions)
		this.actions[i].visible = false;

	if(!this.targets || !this.targets.length)
		return;

	if(this.visible === false)
		return;

	if(!gl.meshes["cone"])
	{
		gl.meshes["circle"] = GL.Mesh.circle({radius:1});
		gl.meshes["cylinder"] = GL.Mesh.cylinder({radius:0.02,height:1});
		gl.meshes["cone"] = GL.Mesh.cone({radius:0.1,height:0.25});
		gl.meshes["torus"] = GL.Mesh.torus({outerradius:1,innerradius:0.02,outerslices:64,innerslices:8});
		gl.meshes["quartertorus"] = GL.Mesh.torus({angle:Math.PI*0.5,outerradius:1,innerradius:0.02,outerslices:64,innerslices:8});
		gl.meshes["halftorus"] = GL.Mesh.torus({angle:Math.PI,outerradius:1,innerradius:0.02,outerslices:64,innerslices:8});
	}
	var cone = gl.meshes["cone"];
	var sphere = gl.meshes["sphere"];
	var torus = gl.meshes["torus"];
	var halftorus = gl.meshes["halftorus"];
	var cylinder = gl.meshes["cylinder"];

	var camfront = camera.getFront();
	var camtop = camera.getLocalVector(RD.UP);
	var camside = camera.getLocalVector(RD.RIGHT);
	var position = this._position;
	pos4.set( position );
	pos4[3] = 1.0;
	var camera_perspective = camera._projection_matrix[5];
	this.updateMatrices();
	model.set( this._global_matrix );
	var truefront = vec3.sub( vec3.create(), position, camera.position );
	vec3.normalize(truefront,truefront);

	this._camera = camera;
	this._unitary_model = model;
	var hover = this._hover_action;
	var selected = this._selected_action;
	if(selected)
		hover = selected;
	var selected_info = selected ? this.actions[ selected ] : null;
	var mode = this.mode;

	mat4.rotateVec3(right,model,RD.RIGHT);
	mat4.rotateVec3(up,model,RD.UP);
	mat4.rotateVec3(front,model,RD.FRONT);
	vec3.normalize(right,right);
	vec3.normalize(up,up);
	vec3.normalize(front,front);
	mat4.fromTranslationFrontTop( model_aligned, position, camfront, camtop );

	vec4.transformMat4( pos4, pos4, camera._viewprojection_matrix );
	var aspect = gl.canvas.width / gl.canvas.height;
	var s = aspect * this.size * pos4[3] / (gl.canvas.width * camera_perspective);
	this.current_size = s;
	mat4.scale( model, model, [s,s,s] );
	mat4.scale( model_aligned, model_aligned, [s,s,s] );

	var dotx = vec3.dot(truefront,right);
	var doty = vec3.dot(truefront,up);
	var dotz = vec3.dot(truefront,front);

	var camdotx = vec3.dot(camfront,RD.RIGHT);
	var camdoty = vec3.dot(camfront,RD.UP);
	var camdotz = vec3.dot(camfront,RD.FRONT);

	var viewport_data = [0,0,gl.canvas.width,gl.canvas.height];
	this._camera.project( position, viewport_data, this.center_2D );

	gl.disable(gl.DEPTH_TEST);
	gl.disable(gl.BLEND);
	gl.disable(gl.CULL_FACE);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

	var shader = gl.shaders[ this.shader ];
	shader.uniforms(renderer._uniforms);
	shader.uniforms(camera.uniforms);
	shader.uniforms(this.uniforms);

	//axis lines when moving
	if( selected == "movex" )
	{
		mat4.rotateZ( tmp, model, -Math.PI / 2 );
		this.drawAxis(tmp, Gizmo.XAXIS_COLOR);
		return;
	}
	if( selected == "movey" )
	{
		this.drawAxis(model, Gizmo.YAXIS_COLOR);
		return;
	}
	if( selected == "movez" )
	{
		mat4.rotateX( tmp, model, -Math.PI / 2 );
		this.drawAxis(tmp, Gizmo.ZAXIS_COLOR);
		return;
	}

	if( selected == "drag" )
	{
		renderer.drawCircle2D(this.center_2D[0],this.center_2D[1],2,Gizmo.XAXIS_COLOR,true);
		return;
	}

	if( selected_info && selected_info.normal && this.render_move_plane ) //plane move
	{
		tmp.set(model);
		//mat4.translate(tmp,tmp,[0,0,0]); //move it a bit to avoid zfighting with the floor
		if( selected == "movexz" )
			mat4.rotateX( tmp, tmp, Math.PI / 2 );
		else if( selected == "moveyz" )
			mat4.rotateY( tmp, tmp, Math.PI / 2 );
		mat4.scale(tmp,tmp,[100,100,100]);
		shader.setUniform("u_model",tmp);
		shader.setUniform("u_color",[0.1,0.1,0.1,0.4]);
		gl.enable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);
		shader.draw( gl.meshes["plane"] );
		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		return;
	}

	if( selected == "rotatefront" )
	{
		mat4.rotateX(tmp, model_aligned, Math.PI/2 );
		shader.setUniform("u_model",tmp);
		shader.draw( torus );
		renderer.drawCircle2D(this.click_2D[0],this.click_2D[1],2,Gizmo.XAXIS_COLOR,true);
		renderer.drawCircle2D(this.click_2D2[0],this.click_2D2[1],2,Gizmo.XAXIS_COLOR,true);
		renderer.drawCircle2D(this.center_2D[0],this.center_2D[1],2,Gizmo.XAXIS_COLOR,true);
		renderer.drawLine2D(this.click_2D[0],this.click_2D[1],this.center_2D[0],this.center_2D[1],4,Gizmo.XAXIS_COLOR);
		renderer.drawLine2D(this.click_2D2[0],this.click_2D2[1],this.center_2D[0],this.center_2D[1],4,Gizmo.XAXIS_COLOR);
		//return;
	}
	else if( selected == "rotate" )
	{
		if(this.click_axis)
		{
			mat4.fromTranslationFrontTop(tmp,position,camfront,this.click_axis);
			mat4.scale( tmp, tmp, [this.current_size,this.current_size,this.current_size]);
			this.drawAxis(tmp, Gizmo.NOAXIS_COLOR);
		}

		this.drawRotateSphere(model,Gizmo.SPHERE_COLOR);
		renderer.drawCircle2D(this.click_2D[0],this.click_2D[1],2,Gizmo.NOAXIS_COLOR,true);
		return;
	}
	else if( selected_info && selected_info.rotate )
	{
		var color = selected_info.color || Gizmo.XAXIS_COLOR;
		if( selected == "rotatex")
			mat4.rotateZ(tmp, model, Math.PI/2 );
		else if( selected == "rotatey")
			mat4.rotateY(tmp, model, Math.PI/2 );
		else if( selected == "rotatez")
			mat4.rotateX(tmp, model, Math.PI/2 );
		shader.setUniform("u_model",tmp);
		shader.setUniform("u_color",color);
		shader.draw( torus );
		renderer.drawCircle2D(this.center_2D[0],this.center_2D[1],2,color,true);
		renderer.drawCircle2D(this.click_2D[0],this.click_2D[1],2,color,true);
		renderer.drawLine2D(this.click_2D[0],this.click_2D[1],this.center_2D[0],this.center_2D[1],4,color);
		renderer.drawCircle2D(this.current_2D[0],this.current_2D[1],2,color,true);
		renderer.drawLine2D(this.current_2D[0],this.current_2D[1],this.center_2D[0],this.center_2D[1],4,color);
		return;
	}

	if(selected == "scale")
	{
		renderer.drawCircle2D(this.center_2D[0],this.click_2D[1],2,Gizmo.INNERSPHERE_COLOR,true);
		renderer.drawCircle2D(this.center_2D[0],this.center_2D[1],2,Gizmo.INNERSPHERE_COLOR,true);
		renderer.drawLine2D(this.center_2D[0],this.click_2D[1],this.center_2D[0],this.center_2D[1],4,Gizmo.INNERSPHERE_COLOR);
		return;		
	}

	this.drawRotateSphere(model,Gizmo.STATIC_SPHERE_COLOR);

	//sphere
	if( mode & Gizmo.ROTATE && hover == "rotate")
	{
		this.drawRotateSphere(model,Gizmo.SPHERE_COLOR);
	}

	//ring
	if( mode & Gizmo.ROTATEFRONT )
	{
		mat4.rotateX(tmp, model_aligned, Math.PI/2 );
		shader.setUniform("u_model",tmp);
		shader.setUniform("u_color", hover == "rotatefront" ? Gizmo.SELECTED_COLOR : Gizmo.RING_COLOR );
		shader.draw( torus );
		this.actions.rotatefront.visible = true;
	}
	//rotator X
	if( Math.abs(dotx) > 0.1 && mode & Gizmo.ROTATEX)
	{
		mat4.rotateZ(tmp, model, Math.PI/2);
		if(camdotz < 0)
			mat4.rotateX(tmp, tmp, Math.PI);
		if(camdoty < 0)
			mat4.rotateY(tmp, tmp, Math.PI/2);
		this.drawRotator(tmp, hover == "rotatex" ? Gizmo.SELECTED_COLOR : Gizmo.XAXIS_COLOR, "rotatex" );
	}

	//rotator Y
	if( Math.abs(doty) > 0.1 && mode & Gizmo.ROTATEY)
	{
		tmp.set(model); //camdotx > 0 && camdotz > 0
		if(camdotx > 0 && camdotz < 0 )
			mat4.rotateY(tmp, tmp, -Math.PI/2);
		else if(camdotx < 0 && camdotz < 0)
			mat4.rotateY(tmp, tmp, Math.PI);
		else if(camdotx < 0 && camdotz > 0)
			mat4.rotateY(tmp, tmp, Math.PI/2);
		this.drawRotator(tmp, hover == "rotatey" ? Gizmo.SELECTED_COLOR : Gizmo.YAXIS_COLOR, "rotatey" );
	}

	//rotator Z
	if( Math.abs(dotz) > 0.1 && mode & Gizmo.ROTATEZ)
	{
		tmp.set(model);
		mat4.rotateX(tmp, tmp, Math.PI/2 ); //camdotx > 0 && camdoty > 0
		if(camdotx > 0 && camdoty < 0 )
			mat4.rotateY(tmp, tmp, -Math.PI/2);
		else if(camdotx < 0 && camdoty < 0)
			mat4.rotateY(tmp, tmp, Math.PI);
		else if(camdotx < 0 && camdoty > 0)
			mat4.rotateY(tmp, tmp, Math.PI/2);

		this.drawRotator(tmp, hover == "rotatez" ? Gizmo.SELECTED_COLOR : Gizmo.ZAXIS_COLOR, "rotatez" );
	}

	//translate X
	if( Math.abs(dotx) < 0.95)
	{
		mat4.rotateZ( tmp, model, camdotx < 0  ? -Math.PI / 2 : Math.PI / 2 );
		if(mode & Gizmo.MOVEX)
			this.drawArrow( tmp, hover == "movex" ? Gizmo.SELECTED_COLOR : Gizmo.XAXIS_COLOR, "movex" );
		if(mode & Gizmo.SCALEX)
			this.drawScale( tmp, hover == "scalex" ? Gizmo.SELECTED_COLOR : Gizmo.XAXIS_COLOR, "scalex" );
	}

	//translate and scale Y
	if( Math.abs(doty) < 0.95)
	{
		if(camdoty > 0)
			mat4.rotateZ( tmp, model, Math.PI );
		else
			tmp.set(model);
		if(mode & Gizmo.MOVEY)
			this.drawArrow( tmp, hover == "movey" ? Gizmo.SELECTED_COLOR : Gizmo.YAXIS_COLOR, "movey" );
		if(mode & Gizmo.SCALEY)
			this.drawScale( tmp, hover == "scaley" ? Gizmo.SELECTED_COLOR : Gizmo.YAXIS_COLOR, "scaley" );
	}

	//translate and scale Z
	if( Math.abs(dotz) < 0.95 )
	{
		mat4.rotateX( tmp, model, camdotz < 0 ? -Math.PI / 2 : Math.PI / 2 );
		if(mode & Gizmo.MOVEZ)
			this.drawArrow( tmp, hover == "movez" ? Gizmo.SELECTED_COLOR : Gizmo.ZAXIS_COLOR, "movez" );
		if(mode & Gizmo.SCALEZ)
			this.drawScale( tmp, hover == "scalez" ? Gizmo.SELECTED_COLOR : Gizmo.ZAXIS_COLOR, "scalez" );
	}

	//translate plane
	if( Math.abs(dotz) > 0.2 && ( mode & Gizmo.MOVEXY || mode & Gizmo.SCALEXY ))
	{
		mat4.translate(tmp,model,[0.45 * (dotx<0?1:-1),0.45 * (doty<0?1:-1),0.0]);
		if( mode & Gizmo.MOVEXY )
			this.drawFlat( tmp, hover == "movexy" ? Gizmo.SELECTED_COLOR : Gizmo.XYAXIS_COLOR, "movexy" );
		else
			this.drawFlat( tmp, hover == "scalexy" ? Gizmo.SELECTED_COLOR : Gizmo.XYAXIS_COLOR, "scalexy", "circle" );
	}

	if( Math.abs(doty) > 0.2 && ( mode & Gizmo.MOVEXZ || mode & Gizmo.SCALEXZ ) )
	{
		mat4.rotateX( tmp, model, Math.PI / 2 );
		mat4.translate(tmp,tmp,[0.45 * (dotx<0?1:-1),0.45 * (dotz<0?-1:1),0.0]);
		if(mode & Gizmo.MOVEXZ)
			this.drawFlat( tmp, hover == "movexz" ? Gizmo.SELECTED_COLOR : Gizmo.XZAXIS_COLOR, "movexz" );
		else
			this.drawFlat( tmp, hover == "scalexz" ? Gizmo.SELECTED_COLOR : Gizmo.XZAXIS_COLOR, "scalexz", "circle" );
	}

	if( Math.abs(dotx) > 0.2 && ( mode & Gizmo.MOVEYZ || mode & Gizmo.SCALEYZ ))
	{
		mat4.rotateY( tmp, model, Math.PI / 2 );
		mat4.translate(tmp,tmp,[0.45 * (dotz<0?1:-1),0.45*(doty<0?1:-1),0.0]);
		if(mode & Gizmo.MOVEYZ)
			this.drawFlat( tmp, hover == "moveyz" ? Gizmo.SELECTED_COLOR : Gizmo.YZAXIS_COLOR, "moveyz" );
		else
			this.drawFlat( tmp, hover == "scaleyz" ? Gizmo.SELECTED_COLOR : Gizmo.YZAXIS_COLOR, "scaleyz", "circle" );
	}


	if( mode & Gizmo.DRAG )
		this.drawInnerSphere(model,"drag");

	if( mode & Gizmo.SCALE )
		this.drawInnerSphere(model,"scale");

	gl.enable(gl.DEPTH_TEST);
}

Gizmo.prototype.drawArrow = function( model, color, action )
{
	var shader = gl.shaders[this.shader];
	var cone = gl.meshes["cone"];
	var cylinder = gl.meshes["cylinder"];
	var hover = this._hover_action;
	mat4.translate( tmp2, model, [0,1.1,0] );
	shader.setUniform("u_model",tmp2);
	shader.setUniform("u_color", hover == action ? Gizmo.SELECTED_COLOR : color);//Gizmo.XAXIS_COLOR);
	shader.draw( cone );

	var action_info = this.actions[action];
	if(this.mode == Gizmo.MOVEALL)
	{
		mat4.translate( tmp2, tmp2, [0,-0.4,0] );
		mat4.scale( tmp2, tmp2, [1,1,1] );
	}
	else
	{
		mat4.translate( tmp2, tmp2, [0,-0.15,0] );
		mat4.scale( tmp2, tmp2, [1,0.5,1] );
	}
	shader.setUniform("u_model",tmp2);
	shader.draw( cylinder );

	this.toScreen(tmp2,action,[0,0.6,0]);
}

Gizmo.prototype.drawAxis = function(model,color)
{
	var shader = gl.shaders[this.shader];
	var mesh = gl.meshes["sphere"]; //lots of polys here?
	mat4.scale( tmp2, model, [0.01,100,0.01] );
	shader.setUniform("u_model",tmp2 );
	gl.enable(gl.DEPTH_TEST);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
	gl.depthMask(false);

	shader.setUniform("u_color",[color[0],color[1],color[2],0.2]);
	gl.depthFunc( gl.GREATER );
	shader.draw( mesh );
	gl.depthFunc( gl.LESS );
	gl.disable(gl.BLEND);

	shader.setUniform("u_color",color);
	shader.draw( mesh );
	
	gl.depthMask(true);
	gl.disable(gl.DEPTH_TEST);
	this.drawInnerSphere(model);
}

Gizmo.prototype.drawFlat = function(model,color,action,mesh_type)
{
	var mesh = gl.meshes[mesh_type || "plane"];
	var shader = gl.shaders[this.shader];
	mat4.scale(tmp,model,[0.25,0.25,0.25]);
	shader.setUniform("u_color",color);
	shader.setUniform("u_model",tmp);
	gl.enable(gl.BLEND);
	shader.draw( mesh );
	gl.disable(gl.BLEND);
	this.toScreen(tmp,action);
}


Gizmo.prototype.drawRotator = function(model,color,action)
{
	var full = false; //this.mode == Gizmo.ROTATEALL;
	var halftorus = gl.meshes[full ? "halftorus" : "quartertorus"];
	var shader = gl.shaders[this.shader];
	mat4.scale(tmp,model,[0.9,0.9,0.9]);
	shader.setUniform("u_color",color);
	shader.setUniform("u_model",tmp);
	shader.draw( halftorus );
	this.toScreen(tmp,action, [-0.75,0,0.75]);
}

Gizmo.prototype.drawScale = function(model,color,action)
{
	var cylinder = gl.meshes["cylinder"];
	var sphere = gl.meshes["sphere"];

	var shader = gl.shaders[this.shader];
	shader.setUniform("u_color",color);

	var action_info = this.actions[action];

	if(this.mode == Gizmo.SCALEALL)
	{
		mat4.translate( tmp, model, [0,0.5,0] );
		mat4.scale( tmp, tmp, [1,1,1] );
	}
	else
	{
		mat4.translate( tmp, model, [0,0.25,0] );
		mat4.scale( tmp, tmp, [1,0.5,1] );
	}

	shader.setUniform("u_model",tmp);
	shader.draw( cylinder );

	mat4.translate( tmp, model, [0,0.4,0] );
	if(this.mode == Gizmo.SCALEALL)
		mat4.scale( tmp, tmp, [0.1,0.1,0.1] );
	else
		mat4.scale( tmp, tmp, [0.1,0.2,0.1] );
	shader.setUniform("u_model",tmp);
	shader.draw( sphere );

	this.toScreen(tmp,action);
}

Gizmo.prototype.drawRotateSphere = function(model, color)
{
	var shader = gl.shaders[this.shader];
	var sphere = gl.meshes["sphere"];
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	mat4.scale( tmp, model, [0.9,0.9,0.9] );
	shader.setUniform("u_model",tmp);
	shader.setUniform("u_color",color);
	shader.draw( sphere );
	gl.disable(gl.BLEND);
}

Gizmo.prototype.drawInnerSphere = function(model, action)
{
	var shader = gl.shaders[this.shader];
	var sphere = gl.meshes["sphere"];
	var hover = this._hover_action;

	mat4.scale( tmp, model, [0.1,0.1,0.1] );
	shader.setUniform("u_model", tmp);
	shader.setUniform("u_color", hover == action ? Gizmo.SELECTED_COLOR :Gizmo.INNERSPHERE_COLOR);
	shader.draw( sphere );

	if( action == "drag" )
	{
		mat4.scale( tmp, model, [0.07,0.07,0.07] );
		shader.setUniform("u_model",tmp);
		shader.setUniform("u_color", hover == action ? Gizmo.INNERSPHERE_COLOR : [0,0,0,1]);
		shader.draw( sphere );
	}

	if(action)
		this.toScreen(tmp,action);
}

Gizmo.prototype.renderOutline = function( renderer, scene, camera, objects )
{
	objects = objects || this.targets;
	if(!objects || !objects.length)
		return;
	var layers = this.layers;
	objects = objects.filter(function(a){ return a.layers & layers; });
	var w = gl.viewport_data[2];
	var h = gl.viewport_data[3];
	if(!this._selection_buffer || this._selection_buffer.width != w || this._selection_buffer.height != h)
	{
		this._selection_buffer = new GL.Texture( w, h, { magFilter: gl.NEAREST});
	}

	if(!Gizmo.outline_material)
		Gizmo.outline_material = new RD.Material({shader_name:"flat"});

	var shadername = this.shader;
	this._selection_buffer.drawTo(function(){
		gl.clearColor(0,0,0,1);
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
		renderer.shader_overwrite = shadername;
		var tmp = renderer.onNodeShaderUniforms;
		renderer.onNodeShaderUniforms = function(node,shader) { shader.setUniform("u_color",[1,1,1,1]); };
		var tmp2 = renderer.pipeline;
		renderer.pipeline = null;

		renderer.overwrite_material = RD.Gizmo.outline_material;

		renderer.render( scene, camera, objects );
		renderer.shader_overwrite = null;
		renderer.onNodeShaderUniforms = tmp;
		renderer.pipeline = tmp2;
		renderer.overwrite_material = null;
	});
	var outline_shader = gl.shaders["outline"];
	if(!outline_shader)
		outline_shader = gl.shaders["outline"] = GL.Shader.createFX("\
			vec3 colorU = texture2D(u_texture, uv - vec2(0.0,u_res.y)).xyz;\n\
			vec3 colorUL = texture2D(u_texture, uv - u_res).xyz;\n\
			vec3 colorUR = texture2D(u_texture, uv + vec2(u_res.x,-u_res.y)).xyz;\n\
			vec3 colorL = texture2D(u_texture, uv - vec2(u_res.x,0.0)).xyz;\n\
			vec3 colorDL = texture2D(u_texture, uv - vec2(u_res.x,-u_res.y)).xyz;\n\
			vec3 outline = abs(color.xyz - colorU) * 0.3 + abs(color.xyz - colorL) * 0.3;\n\
			outline += (abs(color.xyz - colorUL) + abs(color.xyz - colorDL) + abs(color.xyz - colorUR)) * 0.1;\n\
			color = vec4( clamp(outline,vec3(0.0),vec3(1.0)),1.0 );\n\
			//color = texture2D(u_texture, uv);\n\
		","uniform vec2 u_res;\n");

	gl.blendFunc(gl.ONE,gl.ONE);
	gl.enable(gl.BLEND);
	gl.disable(gl.DEPTH_TEST);
	this._selection_buffer.toViewport(outline_shader, {u_color:[1,1,1,1], u_res: [1/w,1/h]});
	gl.disable(gl.BLEND);
	gl.enable(gl.DEPTH_TEST);
}

Gizmo.prototype.renderCameraGizmo = function( renderer, camera )
{
	this.drawInnerSphere
}

Gizmo.prototype.toScreen = function( m, action, pos )
{
	var info = this.actions[action];
	mat4.multiplyVec3( info.pos, m, pos || [0,0,0] );
	this._camera.project( info.pos, Gizmo.full_viewport, info.pos2D );
	info.visible = true;
}

extendClass( Gizmo, RD.SceneNode );
RD.Gizmo = Gizmo;


})(typeof(window) != "undefined" ? window : (typeof(self) != "undefined" ? self : global ));
// https://www.khronos.org/files/gltf20-reference-guide.pdf
RD.GLTF = {
	BYTE: 5120,
	UNSIGNED_BYTE: 5121,
	SHORT: 5122,
	UNSIGNED_SHORT: 5123,
	UNSIGNED_INT: 5125,
	FLOAT: 5126,

	JSON_CHUNK: 0x4E4F534A,
	BINARY_CHUNK: 0x004E4942,

	buffer_names: {
		POSITION: "vertices",
		NORMAL: "normals",
		COLOR_0: "colors",
		TEXCOORD_0: "coords",
		TEXCOORD_1: "coords1",
		WEIGHTS_0: "weights",
		JOINTS_0: "bones"
	},

	numComponents: { "SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT4":16 },

	rename_animation_properties: { "translation":"position","scale":"scaling" },

	flip_uv: true,
	overwrite_materials: true,

	prefabs: {},

	texture_options: { format: GL.RGBA, magFilter: GL.LINEAR, minFilter: GL.LINEAR_MIPMAP_LINEAR, wrap: GL.REPEAT },

	load: function( url, callback, extension, callback_progress )
	{
		var json = null;
		var filename = "";
		var folder = "";

		//its a regular url
		if(url.constructor === String)
		{
			folder = url.split("/");
			filename = folder.pop();
			extension = extension || filename.split(".").pop().toLowerCase();
			folder = folder.join("/");

			console.log("loading gltf json...");

			var xhr = new XMLHttpRequest();
			xhr.onload = function() {
				if(this.status != 200)
				{
					console.error("GLTF not found",url);
					if(callback)
						callback(null);
					return;
				}
				//console.log("Loaded: ",xhr.status,xhr.response );
				onData(xhr.response);
			};

			xhr.onerror = function() { // only triggers if the request couldn't be made at all
			  console.error("Network Error");
			  if(callback)
				  callback(null);
			};

			if(callback_progress)
				xhr.onprogress = function(event) { // triggers periodically
				  callback_progress(url, event.loaded, event.total);
				};

			xhr.responseType = extension == "gltf" ? "json" : "arraybuffer";
			xhr.open('GET', url);
			xhr.send();
		}
		else //array of files already loaded
		{
			var files_data = url;
			console.log(files_data);
			filename = files_data["main"];
			url = filename;
			var main = files_data[ filename ];
			if(main.extension == "glb")
			{
				json = RD.GLTF.parseGLB(main.data);
				if(!json)
					return;
				onFetchComplete();
				return;
			}
			json = main.data;

			//gltf
			for(var i = 0; i < json.buffers.length; ++i)
			{
				var buffer = json.buffers[i];
				var data = null;
				if( buffer.uri.substr(0,5) == "data:")
					buffer.data = _base64ToArrayBuffer( buffer.uri.substr(37) );
				else
				{
					var file = files_data[ buffer.uri ];
					buffer.data = file.data;
				}

				buffer.dataview = new Uint8Array( buffer.data );
				/*
				if(data.byteLength != buffer.byteLength)
					console.warn("gltf binary doesnt match json size hint");
				*/
			}
			onFetchComplete();
		}

		function fetchBinaries( list )
		{
			var buffer = list.pop();
			var bin_url = folder + "/" + buffer.uri;
			console.log(" - loading " + buffer.uri + " ...");
			if( buffer.uri.substr(0,5) == "data:")
			{
				var data = _base64ToArrayBuffer( buffer.uri.substr(37) );
				onBinary.call({buffer:buffer}, data );
			}
			else
				fetch( bin_url ).then(function(response) {
					return response.arrayBuffer();
				}).then(onBinary.bind({buffer:buffer}));

			function onBinary( data )
			{
				var buffer = this.buffer;
				buffer.data = data;
				buffer.dataview = new Uint8Array(data);
				//if(data.byteLength != buffer.byteLength) //it is always different ??
				//	console.warn("gltf binary doesnt match json size hint");
				if(list.length)
					fetchBinaries( list );
				else
					onFetchComplete();
			}
		}

		function onFetchComplete()
		{
			console.log("parsing gltf ...");
			json.filename = filename;
			json.folder = folder;
			json.url = url;
			var node = RD.GLTF.parse( json );
			RD.GLTF.prefabs[ url ] = node.serialize();
			if(callback)
				callback(node);
		}

		function onData(data)
		{
			if( extension == "gltf" )
			{
				json = data;
				console.log("loading gltf binaries...");
				fetchBinaries( json.buffers.concat() );
			}
			else if( extension == "glb" )
			{
				json = RD.GLTF.parseGLB(data);
				if(!json)
					return;
				onFetchComplete();
			}
		}
	},

	parseGLB: function(data)
	{
		var view = new Uint8Array( data );

		//read header
		var endianess = true;
		var dv = new DataView( data );
		var magic = dv.getUint32(0,endianess);

		if(magic != 0x46546C67)
		{
			console.error("incorrect gltf header");
			return null;
		}
		var version = dv.getUint32(4,endianess);
		console.log("GLTF Version: " + version);

		var length = dv.getUint32(8,endianess); //full size

		var byteOffset = 12;
		var json = null;
		var chunk_index = 0;

		//first chunk
		while(byteOffset < view.length)
		{
			var chunk_size = dv.getUint32(byteOffset,endianess);
			var chunk_type = dv.getUint32(byteOffset+4,endianess);
			var chunk_data = data.slice(byteOffset+8, byteOffset+8+chunk_size);
			byteOffset += 8 + chunk_size;

			if(chunk_type == RD.GLTF.JSON_CHUNK)
			{
				if (!("TextDecoder" in window))
				  throw("Sorry, this browser does not support TextDecoder...");

				var enc = new TextDecoder("utf-8");
				var str = enc.decode(chunk_data);
				json = JSON.parse(str);
			}
			else if(chunk_type == RD.GLTF.BINARY_CHUNK)
			{
				var buffer = json.buffers[chunk_index];
				buffer.data = chunk_data;
				buffer.dataview = new Uint8Array(chunk_data);
				if(data.byteLength != buffer.byteLength)
					console.warn("gltf binary doesnt match json size hint");
				chunk_index++;
			}
			else
				console.warn("gltf unknown chunk type: ", "0x"+chunk_type.toString(16));
		}

		return json;
	},

	parse: function(json)
	{
		console.log(json);

		var root = null;
		var nodes_by_id = {};
		if( json.scenes.length > 1 )
			console.warn("gltf importer only supports one scene per file, skipping the rest");

		var scene = json.scenes[ json.scene ];
		var nodes_info = scene.nodes;
		this.gltf_materials = {};

		var root = null;
		if(nodes_info.length > 1) //multiple root nodes
		{
			root = new RD.SceneNode();
			root.name = "root";
		}

		for(var i = 0; i < nodes_info.length; ++i)
		{
			var info = nodes_info[i];
			var index = info;
			if(info.node != null)
				index = info.node;
			var node = RD.GLTF.parseNode( null, index, json );
			if(!root)
				root = node;
			if(nodes_info.length > 1)
				root.addChild( node );
			node.id = json.url.replace(/\//gi,"_") + "::node_" + i;
			nodes_by_id[ node.id ] = nodes_by_id[ i ] = node;
		}

		if(json.animations && json.animations.length)
		{
			if(!RD.Animation)
				console.error("you must include rendeer-animation.js to allow animations");
			else
			{
				root.animations = [];
				for(var i = 0; i < json.animations.length; ++i)
				{
					var animation = this.parseAnimation(i,json,nodes_by_id);
					animation.id = json.filename + "::" + animation.name;
					if(animation)
					{
						RD.Animations[ animation.id ] = animation;
						root.animations.push(animation);
					}
				}
			}
		}

		root.materials = this.gltf_materials;
		return root;
	},

	parseNode: function(node, index, json)
	{
		var info = json.nodes[ index ];

		node = node || new RD.SceneNode();

		//extract node info
		for(var i in info)
		{
			var v = info[i];
			switch(i)
			{
				case "name": node.name = v; break;
				case "translation": node.position = v; break;
				case "rotation": node.rotation = v; break;
				case "scale": node.scaling = v;
					var numneg = 0; //GLTFs and negative scales are pain in the ass
					if (node.scaling[0] < 0)
						numneg++;
					if (node.scaling[1] < 0)
						numneg++;
					if (node.scaling[2] < 0)
						numneg++;
					if( numneg%2 == 1)
						node.flags.frontFace = GL.CW; //reverse
					break;
				case "matrix": 
					node.fromMatrix( v );
					break;
				case "mesh": 
					var mesh = RD.GLTF.parseMesh(v, json);
					if(mesh)
					{
						node.mesh = mesh.name;
						node.primitives = [];
						for(var j = 0; j < mesh.info.groups.length; ++j)
						{
							var group = mesh.info.groups[j];
							var material = null;
							if(group.material != null)
								material = this.parseMaterial( group.material, json );
							node.primitives.push({
								index: j, 
								material: material ? material.name : null, //meshes without material can exists
								mode: group.mode
							});
						}
					}
					break;
				case "skin":
					node.skin = this.parseSkin( v, json );
					break;
				case "children": 
					if(v.length)
					{
						for(var j = 0; j < v.length; ++j)
						{
							var subnode_info = json.nodes[ v[j] ];
							var subnode = RD.GLTF.parseNode( null, v[j], json );
							node.addChild(subnode);
						}
					}
					break;
				case "extras":
					break;
				default:
					console.log("gltf node info ignored:",i,info[i]);
					break;
			}
		}

		if(!info.name)
			info.name = node.name = "node_" + index;

		return node;
	},

	parseMesh: function(index, json)
	{
		var mesh_info = json.meshes[index];
		var meshes_container = gl.meshes;

		//extract primitives
		var meshes = [];
		var prims = [];
		var start = 0;
		for(var i = 0; i < mesh_info.primitives.length; ++i)
		{
			var prim = this.parsePrimitive( mesh_info, i, json );
			if(!prim)
				continue;
			prim.start = start;
			start += prim.length;
			prims.push(prim);
			var mesh_primitive = { vertexBuffers: {}, indexBuffers:{} };
			for(var j in prim.buffers)
				if( j == "indices" || j == "triangles" )
					mesh_primitive.indexBuffers[j] = { data: prim.buffers[j] };
				else
					mesh_primitive.vertexBuffers[j] = { data: prim.buffers[j] };
			meshes.push({ mesh: mesh_primitive });
		}

		//merge primitives
		var mesh = null;
		if(meshes.length > 1)
			mesh = GL.Mesh.mergeMeshes( meshes );
		else if (meshes.length == 1)
		{
			var mesh_data = meshes[0].mesh;
			mesh = new GL.Mesh( mesh_data.vertexBuffers, mesh_data.indexBuffers );
			if( mesh.info && mesh_data.info)
				mesh.info = mesh_data.info;
		}

		if(!mesh)
			return null;

		for(var i = 0; i < mesh_info.primitives.length; ++i)
		{
			var g = mesh.info.groups[i];
			if(!g)
				mesh.info.groups[i] = g = {};
			var prim = mesh_info.primitives[i];
			g.material = prim.material;
			g.mode = prim.mode != null ? prim.mode : 4; //GL.TRIANGLES
			g.start = prims[i].start;
			g.length = prims[i].length;
		}

		mesh.name = mesh_info.name || "mesh_" + index;
		//mesh.material = primitive.material;
		//mesh.primitive = mesh_info.mode;
		mesh.updateBoundingBox();
		mesh.computeGroupsBoundingBoxes();
		meshes_container[ mesh.name ] = mesh;
		return mesh;
	},

	parsePrimitive: function( mesh_info, index, json )
	{
		var primitive = {
			buffers: {}
		};

		var buffers = primitive.buffers;
		var primitive_info = mesh_info.primitives[ index ];
		if(primitive_info.extensions)
		{
			if(primitive_info.extensions["KHR_draco_mesh_compression"])
			{
				if(typeof(DracoDecoderModule) == "undefined")
					throw("mesh data is compressed using Draco, draco_decoder.js not installed.");
				buffers = primitive.buffers = this.decompressDraco( primitive_info, json );
			}
			else
			{
				throw("mesh data is compressed, this importer does not support it yet");
				return null;
			}
		}
		else
		{
			if(!primitive_info.attributes.POSITION == null)
				console.warn("gltf mesh without positions");

			for(var i in this.buffer_names)
			{
				var prop_name = this.buffer_names[i];
				var flip = prop_name == "coords" || prop_name == "coords1";
				var att_index = primitive_info.attributes[i];
				if(att_index == null)
					continue;
				var data = this.parseAccessor( att_index, json, flip );
				if(data)
					buffers[prop_name] = data;
			}

			//indices
			if(primitive_info.indices != null)
				buffers.triangles = this.parseAccessor( primitive_info.indices, json );
		}

		if(!buffers.vertices)
		{
			console.error("primitive without vertices");
			return null;
		}

		primitive.mode = primitive_info.mode;
		primitive.material = primitive_info.material;
		primitive.start = 0;
		primitive.length = buffers.triangles ? buffers.triangles.length : buffers.vertices.length / 3;
		return primitive;
	},

	installDracoModule: function( callback )
	{
		var types = this.draco_data_types = {};

		var that = this;
		//fetch module
		if(this.decoderModule)
		{
			if(callback)
				callback(this.decoderModule);
			return;
		}

		if(typeof(DracoDecoderModule) != "undefined")
			DracoDecoderModule({}).then(function(module) {
				var draco = that.decoderModule = module;
				types[ draco.DT_INT8	] = Int8Array;
				types[ draco.DT_UINT8	] = Uint8Array;
				types[ draco.DT_INT16	] = Int16Array;
				types[ draco.DT_UINT16	] = Uint16Array;
				types[ draco.DT_INT32	] = Int32Array;
				types[ draco.DT_UINT32	] = Uint32Array;
				types[ draco.DT_FLOAT32	] = Float32Array;
				if(callback)
					callback(module);
			});
		else
			console.error("Draco3D not installed");
	},

	decompressDraco: function( primitive_info, json )
	{
		if(!this.draco_decoder)
			this.draco_decoder = new this.decoderModule.Decoder();
		var result = this.decodePrimitive( this.draco_decoder, primitive_info, json );
		return result;
	},

	decodePrimitive: function( decoder, primitive_info, json )
	{
		console.log(primitive_info);
		var ext_data = primitive_info.extensions.KHR_draco_mesh_compression;
		var buffers = {};

		//every mesh is stored in an independent buffer view
		var bufferView = json.bufferViews[ ext_data.bufferView ];
		var buffer = json.buffers[ bufferView.buffer ];
		var rawBuffer = buffer.dataview.buffer;

		//transform buffer view to geometry
		var draco = this.decoderModule;
		var buffer = new draco.DecoderBuffer();
		buffer.Init(new Int8Array(rawBuffer), rawBuffer.byteLength);
		var geometryType = decoder.GetEncodedGeometryType(buffer);
		if (geometryType == draco.TRIANGULAR_MESH) {
			//extract
			var uncompressedDracoMesh = new draco.Mesh();
			var status = decoder.DecodeBufferToMesh( buffer, uncompressedDracoMesh );
			if ( !status.ok() || uncompressedDracoMesh.ptr === 0 ) {
				throw new Error( 'GLTF Draco: Decoding failed: ' + status.error_msg() );
			}

			var size = uncompressedDracoMesh.num_points() * 3;

			//transform from draco geometry to my own format
			for(var i in this.buffer_names)
			{
				var prop_name = this.buffer_names[i];
				var draco_buffer_name = i;
				if( draco_buffer_name == "COLOR_0")
					draco_buffer_name = "COLOR";
				else if( draco_buffer_name == "TEXCOORD_0")
					draco_buffer_name = "TEX_COORD";
				var flip = prop_name == "coords" || prop_name == "coords1";
				var buff = this.decodeBuffer( uncompressedDracoMesh, draco[ draco_buffer_name ], flip, decoder );
				if(buff)
					buffers[prop_name] = buff.data;
			}

			//get indices
			var numFaces = uncompressedDracoMesh.num_faces();
			var numIndices = numFaces * 3;
			var byteLength = numIndices * 4;

			var ptr = draco._malloc( byteLength );
			decoder.GetTrianglesUInt32Array( uncompressedDracoMesh, byteLength, ptr );
			buffers.triangles = new Uint32Array( draco.HEAPF32.buffer, ptr, numIndices ).slice();
			draco._free( ptr );
		}

		draco.destroy( buffer );
		draco.destroy( uncompressedDracoMesh );
		return buffers;
	},

	decodeBuffer: function( uncompressedDracoMesh, index, flip, decoder )
	{
		if(index == null)
			return null;
		var draco = this.decoderModule;
		//transform from draco geometry to my own format
		var attId = decoder.GetAttributeId( uncompressedDracoMesh, index );
		if(attId == -1)
			return null;
		var att = decoder.GetAttribute( uncompressedDracoMesh, attId );
		var data_type = att.data_type();
		var num_comps = att.num_components();
		var num_points = uncompressedDracoMesh.num_points();
		var size = att.size();
		var total_length = num_points * num_comps;
		var ctor = this.draco_data_types[ data_type ];
		var bytes = total_length * ctor.BYTES_PER_ELEMENT;

		//*
		var attData = new draco.DracoFloat32Array();
		decoder.GetAttributeFloatForAllPoints( uncompressedDracoMesh, att, attData );
		var data = new ctor( total_length );
		for(var i = 0; i < data.length; ++i)
			data[i] = attData.GetValue(i);
		//*/
		/*
		var ptr = draco._malloc( bytes );
		decoder.GetAttributeDataArrayForAllPoints( uncompressedDracoMesh, att, data_type, bytes, ptr );
		var data = new ctor( draco.HEAPF32.buffer, ptr, total_length ).slice();
		draco._free( ptr );
		//*/

		if(flip)
			for(var i = 1; i < data.length; i+=num_comps)
				data[i] = 1.0 - data[i];

		return {
			num_points: num_points,
			num_comps: num_comps,
			data_type: data_type,
			data: data
		};
	},

	parseAccessor: function( index, json, flip_y, bufferView, decoder )
	{
		var accessor = json.accessors[index];
		if(!accessor)
		{
			console.warn("gltf accessor not found");
			return null;
		}

		var components = this.numComponents[ accessor.type ];
		if(!components)
		{
			console.warn("gltf accessor of unknown type:",accessor.type);
			return null;
		}

		//num numbers
		var size = accessor.count * components;

		//create buffer
		switch( accessor.componentType )
		{
			case RD.GLTF.FLOAT: databuffer = new Float32Array( size ); break;
			case RD.GLTF.UNSIGNED_INT: databuffer = new Uint32Array( size ); break;
			case RD.GLTF.SHORT: databuffer = new Int16Array( size );  break;
			case RD.GLTF.UNSIGNED_SHORT: databuffer = new Uint16Array( size );  break;
			case RD.GLTF.BYTE: databuffer = new Int8Array( size );  break;
			case RD.GLTF.UNSIGNED_BYTE: databuffer = new Uint8Array( size );  break;
			default:
				console.warn("gltf accessor of unsupported type: ", accessor.componentType);
				databuffer = new Float32Array( size );
		}

		if(bufferView == null)
			bufferView = json.bufferViews[ accessor.bufferView ];

		if(!bufferView)
		{
			console.warn("gltf bufferView not found");
			return null;
		}

		var buffer = json.buffers[ bufferView.buffer ];
		if(!buffer || !buffer.data)
		{
			console.warn("gltf buffer not found or data not loaded");
			return null;
		}

		if(bufferView.byteStride && bufferView.byteStride != components * databuffer.BYTES_PER_ELEMENT)
		{
			console.warn("gltf buffer data is not tightly packed, not supported");
			return null;
		}

		var databufferview = new Uint8Array( databuffer.buffer );

		if(bufferView.byteOffset == null)//could happend when is 0
			bufferView.byteOffset = 0;

		//extract chunk from binary (not using the size from the bufferView because sometimes it doesnt match!)
		var start = bufferView.byteOffset + (accessor.byteOffset || 0);
		var chunk = buffer.dataview.subarray( start, start + databufferview.length );

		//copy data to buffer
		databufferview.set( chunk );

		//decode?
		//if(decoder)
		//	databufferview = this.decodeBuffer( databufferview.buffer, decoder );

		if(flip_y)
			for(var i = 1; i < databuffer.length; i += components )
				databuffer[i] = 1.0 - databuffer[i]; 

		return databuffer;
	},

	parseMaterial: function( index, json )
	{
		var info = json.materials[index];
		if(!info)
		{
			console.warn("gltf material not found");
			return null;
		}

		var mat_name = info.name || json.filename + "::mat_" + index;

		var material = RD.Materials[ mat_name ];
		if(material && (!this.overwrite_materials || material.from_filename == json.filename) )
			return material;

		material = new RD.Material();
		material.name = mat_name;
		material.from_filename = json.filename;
		//material.shader_name = "phong";

		if(info.alphaMode != null)
			material.alphaMode = info.alphaMode;
		material.alphaCutoff = info.alphaCutoff != null ? info.alphaCutoff : 0.5;
		if(info.doubleSided != null)
			material.flags.two_sided = info.doubleSided;
		material.normalmapFactor = 1.0;

		if(info.pbrMetallicRoughness)
		{
			material.model = "pbrMetallicRoughness";

			//default values
			material.color.set([1,1,1]);
			material.opacity = 1;
			material.metallicFactor = 1;
			material.roughnessFactor = 1;

			if(info.pbrMetallicRoughness.baseColorFactor != null)
				material.color = info.pbrMetallicRoughness.baseColorFactor;
			if(info.pbrMetallicRoughness.baseColorTexture)
			{
				material.textures.albedo = this.parseTexture( info.pbrMetallicRoughness.baseColorTexture, json );
				if( material.alphaMode == "MASK" && gl.extensions.EXT_texture_filter_anisotropic ) //force anisotropy
				{
					var tex = gl.textures[ material.textures.albedo.texture ];
					if(tex)
					{
						tex.bind(0);
						gl.texParameteri( gl.TEXTURE_2D, gl.extensions.EXT_texture_filter_anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, 8 );
					}
				}
			}
			if(info.pbrMetallicRoughness.metallicFactor != null)
				material.metallicFactor = info.pbrMetallicRoughness.metallicFactor;
			if(info.pbrMetallicRoughness.roughnessFactor != null)
				material.roughnessFactor = info.pbrMetallicRoughness.roughnessFactor;
			//GLTF do not support metallic or roughtness in individual textures
			if(info.pbrMetallicRoughness.metallicRoughnessTexture) //RED: Occlusion, GREEN: Roughtness, BLUE: Metalness
				material.textures.metallicRoughness = this.parseTexture( info.pbrMetallicRoughness.metallicRoughnessTexture, json );
		}

		if(info.occlusionTexture)
			material.textures.occlusion = this.parseTexture( info.occlusionTexture, json );
		if(info.normalTexture)
			material.textures.normal = this.parseTexture( info.normalTexture, json );
		if(info.emissiveTexture)
			material.textures.emissive = this.parseTexture( info.emissiveTexture, json );
		if(info.emissiveFactor)
			material.emissive = info.emissiveFactor;

		RD.Materials[ material.name ] = material;
		this.gltf_materials[ material.name ] = material;

		return material;
	},

	parseTexture: function( mat_tex_info, json )
	{
		var info = json.textures[ mat_tex_info.index ];
		if(!info)
		{
			console.warn("gltf texture not found");
			return null;
		}

		//source
		var source = json.images[ info.source ];
		var extension = "";
		var image_name = null;
		if(source.uri)
		{
			image_name = source.uri;
			extension = image_name.split(".").pop();
		}
		else
		{
			image_name = json.url.replace(/[\/\.\:]/gi,"_") + "_image_" + mat_tex_info.index;// + ".png";
			if( source.mimeType )
				extension = (source.mimeType.split("/").pop());
			else
				extension = "png"; //defaulting
			image_name += "." + extension;
		}


		var result = {};

		var tex = gl.textures[ image_name ];
		if( !tex )
		{
			if(source.uri) //external image file
			{
				var filename = source.uri;
				if(filename.substr(0,5) == "data:")
				{
					var start = source.uri.indexOf(",");
					var mimeType = source.uri.substr(5,start);
					var extension = mimeType.split("/").pop().toLowerCase();
					var image_name = json.folder + "/" + filename + "image_" + mat_tex_info.index + "." + extension;
					var image_bytes = _base64ToArrayBuffer( source.uri.substr(start+1) );
					var image_url = URL.createObjectURL( new Blob([image_bytes],{ type : mimeType }) );
					//var img = new Image(); img.src = image_url; document.body.appendChild(img); //debug
					var texture = GL.Texture.fromURL( image_url, this.texture_options );
					texture.name = image_name;
					gl.textures[ image_name ] = texture;

				}
				else
					result.texture = json.folder + "/" + filename;
			}
			else if(source.bufferView != null) //embeded image file
			{
				var bufferView = json.bufferViews[ source.bufferView ];
				if(bufferView.byteOffset == null)
					bufferView.byteOffset = 0;
				var buffer = json.buffers[ bufferView.buffer ];
				var image_bytes = buffer.data.slice( bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength );
				var image_url = URL.createObjectURL( new Blob([image_bytes],{ type : source.mimeType }) );
				//var img = new Image(); img.src = image_url; document.body.appendChild(img); //debug
				var texture = GL.Texture.fromURL( image_url, this.texture_options );
				texture.name = image_name;
				gl.textures[ image_name ] = texture;
			}
		}

		if(!result.texture)
			result.texture = image_name;

		//sampler
		if(info.sampler != null)
		{
			var sampler = json.samplers[ info.sampler ];
			if(sampler.magFilter != null)
				result.magFilter = sampler.magFilter;
			if(sampler.minFilter != null)
				result.minFilter = sampler.minFilter;
		}

		if( mat_tex_info.texCoord )
			result.uv_channel = mat_tex_info.texCoord;

		return result;
	},

	parseSkin: function( index, json )
	{
		var info = json.skins[ index ];
		var skin = {};
		if( info.skeleton != null )
			skin.skeleton_root = json.nodes[ info.skeleton ].name;
		skin.bindMatrices = this.splitBuffer( this.parseAccessor( info.inverseBindMatrices, json ), 16 );
		skin.joints = [];
		for(var i = 0; i < info.joints.length; ++i)
		{
			var joint = json.nodes[ info.joints[i] ];
			skin.joints.push( joint.id );
		}
		return skin;
	},

	splitBuffer: function( buffer, length )
	{
		var l = buffer.length;
		var result = [];
		for(var i = 0; i < l; i+= length)
			result.push( new buffer.constructor( buffer.subarray(i,i+length) ) );
		return result;
	},

	//parses an animation and returns it as a RD.Animation
	parseAnimation: function(index, json, nodes_by_id )
	{
		var info = json.animations[index];
		var animation = new RD.Animation();
		animation.name = info.name || "anim_" + index;
		var duration = 0;

		for(var i = 0; i < info.channels.length; ++i)
		{
			var track = new RD.Animation.Track();
			var channel = info.channels[i];
			var sampler = info.samplers[channel.sampler];

			track.target_node = json.nodes[ channel.target.node ].name;
			track.target_property = channel.target.path.toLowerCase();

			var renamed = this.rename_animation_properties[ track.target_property ];
			if(renamed)
				track.target_property = renamed;

			var timestamps = this.parseAccessor( sampler.input, json );
			var keyframedata = this.parseAccessor( sampler.output, json );
			var type = json.accessors[ sampler.output ].type;
			var type_enum = RD.TYPES[type];
			if( type_enum == RD.VEC4 && track.target_property == "rotation")
				type_enum = RD.QUAT;
			track.type = type_enum;
			var num_components = RD.TYPES_SIZE[ type_enum ];

			if(!num_components)
			{
				console.warn("gltf unknown type:",type);
				continue;
			}
			var num_elements = keyframedata.length / num_components;
			var keyframes = new Float32Array( (1+num_components) * num_elements );
			for(var j = 0; j < num_elements; ++j)
			{
				keyframes[j*(1+num_components)] = timestamps[j];
				var value = keyframedata.subarray(j*num_components,j*num_components+num_components);
				//if(type_enum == RD.QUAT)
				//	quat.identity(value,value);
				keyframes.set( value, j*(1+num_components)+1 );
			}
			track.data = keyframes;
			track.packed_data = true;
			duration = Math.max( duration, timestamps[ timestamps.length - 1] );

			animation.addTrack( track );
		}

		animation.duration = duration;

		return animation;
	},

	loadFromFiles: function(files,callback)
	{
		//search for .GLTF
		//...
		var files_data = {};
		var pending = files.length;
		var that = this;
		var bins = [];

		for(var i = 0; i < files.length; ++i)
		{
			var file = files[i];
			var reader = new FileReader();
			var t = file.name.split(".");
			var extension = t[ t.length - 1 ].toLowerCase();
			reader.onload = inner;
			reader.filename = file.name;
			reader.extension = extension;
			if(extension == "gltf")
				reader.readAsText(file);
			else
				reader.readAsArrayBuffer(file);
		}

		function inner(e)
		{
			var data = e.target.result;
			var extension = this.extension;
			if(extension == "gltf")
			{
				data = JSON.parse(data);
				files_data["main"] = this.filename;
			}
			else if(extension == "glb")
				files_data["main"] = this.filename;
			else if(extension == "bin")
				bins.push(this.filename);
			else if(extension == "jpeg" || extension == "jpg" || extension == "png")
			{
				var image_url = URL.createObjectURL( new Blob([data],{ type : e.target.mimeType }) );
				var texture = GL.Texture.fromURL( image_url, { wrap: gl.REPEAT, extension: extension } );				
				texture.name = this.filename;
				gl.textures[ texture.name ] = texture;
			}

			files_data[ this.filename ] = { 
				filename: this.filename,
				data: data,
				extension: this.extension
			};
			pending--;
			if(pending == 0)
			{
				files_data["binaries"] = bins;
				that.load( files_data, function(node) {
					if(callback)
						callback(node);
				});
			}
		}
	}
};

RD.SceneNode.prototype.loadGLTF = function( url, callback )
{
	var that = this;

	if( RD.GLTF.prefabs[url] )
	{
		var node = new RD.SceneNode();
		node.configure( RD.GLTF.prefabs[url] );
		inner( node );
		return;
	}

	RD.GLTF.load( url, inner);

	function inner(node)
	{
		that.addChild( node );
		if(callback)
			callback(that);
	}
}

function _base64ToArrayBuffer(base64) {
    var binary_string = window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

//load module
if(typeof(DracoDecoderModule) != "undefined")
	RD.GLTF.installDracoModule(RD.GLTF.onReady);

(function(global){
var RD = global.RD;

//Adds a pipeline to render in PBR
//It supports rendering in deferred mode or forward mode
function PBRPipeline( renderer )
{
	this.renderer = renderer;
	this.mode = PBRPipeline.FORWARD;
	this.fbo = null;
	this.visible_layers = 0xFFFF;
	this.bgcolor = vec4.fromValues(0.1,0.1,0.1,1.0);
	this.environment_texture = null;
	this.render_skybox = true;
	this.skybox_texture = null; //in case is different from the environment texture
	this.environment_sh_coeffs = null;
	this.environment_rotation = 180;
	this.environment_factor = 1;
	this.exposure = 1;
	this.occlusion_factor = 1;
	this.emissive_factor = 1.0; //to boost emissive

	this.contrast = 1.0;
	this.brightness = 1.0;
	this.gamma = 2.2;

	this.parallax_reflection = false;
	this.parallax_reflection_matrix = mat4.create();
	this.parallax_reflection_matrix_inv = mat4.create();

	this.texture_matrix = mat3.create();

	this.resolution_factor = 1;
	this.quality = 1;
	this.test_visibility = true;
	this.single_pass = false;

	this.use_rendertexture = true;
	this.fx = null;

	this.alpha_composite_target_texture = null;

	//this.overwrite_shader_name = "normal";

	this.global_uniforms = {
		u_brdf_texture: 0,
		u_exposure: this.exposure,
		u_occlusion_factor: this.occlusion_factor,
		u_background_color: this.bgcolor.subarray(0,3),
		u_tonemapper: 0,
		u_gamma: this.gamma,
		u_SpecularEnvSampler_texture: 1,
		u_skybox_mipCount: 5,
		u_skybox_info: [ this.environment_rotation, this.environment_factor ],
		u_use_environment_texture: false,
		u_viewport: gl.viewport_data,
		u_clipping_plane: vec4.fromValues(0,0,0,0)
    };

	this.material_uniforms = {
		u_albedo: vec3.fromValues(1,1,1),
		u_emissive: vec3.fromValues(0,0,0),
		u_roughness: 1,
		u_metalness: 1,
		u_alpha: 1.0,
		u_alpha_cutoff: 0.0,
		u_tintColor: vec3.fromValues(1,1,1),
		u_normalFactor: 1,
		u_metallicRough: false, //use metallic rough texture
		u_reflectance: 0.1, //multiplied by the reflectance function
		u_texture_matrix: this.texture_matrix,
		u_displacement_factor: 0.0,

		u_maps_info: new Int8Array(10), //info about channels

		u_clearCoat: 0.0,
		u_clearCoatRoughness: 0.5,
	
		u_isAnisotropic: false,
		u_anisotropy: 0.5,
		u_anisotropy_direction: vec3.fromValues(0,0,1.0)
	};

	this.sampler_uniforms = {};

	this.material_uniforms.u_maps_info.fill(-1);

	this.fx_uniforms = {
		u_viewportSize: vec2.create(),
		u_iViewportSize: vec2.create()
	};

	this.final_texture = null; //HDR image that contains the final scene before tonemapper
	this.final_fbo = null;

	this.render_calls = [];
	this.num_render_calls = 0;
	this.last_num_render_calls = 0;

	this.compiled_shaders = {};//new Map();

	this.max_textures = gl.getParameter( gl.MAX_TEXTURE_IMAGE_UNITS );
	this.max_texture_size = gl.getParameter( gl.MAX_TEXTURE_SIZE );

	this.default_material = new RD.Material();

	this.onRenderBackground = null;
}

PBRPipeline.FORWARD = 1;
PBRPipeline.DEFERRED = 2;

PBRPipeline.MACROS = {
	UVS2: 1,	
	COLOR: 1<<1,
	PARALLAX_REFLECTION: 1<<2
};

PBRPipeline.maps = ["albedo","metallicRoughness","occlusion","normal","emissive","opacity","displacement","detail"];

PBRPipeline.prototype.render = function( renderer, nodes, camera, scene, skip_fbo, layers )
{
	this.renderer = renderer;

	if(this.mode == PBRPipeline.FORWARD)
		this.renderForward( nodes, camera, skip_fbo, layers );
	else if(this.mode == PBRPipeline.DEFERRED)
		this.renderDeferred( nodes, camera, layers );

	var brdf_tex = this.getBRDFIntegratorTexture();
	if(brdf_tex && 0) //debug
	{
		gl.viewport(0,0,256,256);
		brdf_tex.toViewport();
		gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
	}
}

//gathers uniforms that do not change between rendered objects
PBRPipeline.prototype.fillGlobalUniforms = function()
{
	var brdf_tex = this.getBRDFIntegratorTexture();
	if(brdf_tex)
		brdf_tex.bind( 0 );
	if(this.environment_texture)
	{
		this.environment_texture.bind(1);
		this.global_uniforms.u_use_environment_texture = true;
	}
	else
		this.global_uniforms.u_use_environment_texture = false;

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
	this.global_uniforms.u_occlusion_factor = this.occlusion_factor;
	this.global_uniforms.u_background_color = this.bgcolor.subarray(0,3);
}

PBRPipeline.prototype.renderForward = function( nodes, camera, skip_fbo, layers )
{
	//prepare buffers
	var w = Math.floor( gl.viewport_data[2] * this.resolution_factor );
	var h = Math.floor( gl.viewport_data[3] * this.resolution_factor );

	//avoid creating textures too big
	w = Math.min( w, this.max_texture_size );
	h = Math.min( h, this.max_texture_size );

	//set up render buffer in case we want to apply postFX
	if(this.use_rendertexture && !skip_fbo)
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

	//set default 
	gl.frontFace( gl.CCW );
	gl.enable( gl.DEPTH_TEST );
	gl.disable( gl.BLEND );

	//render skybox
	if(this.onRenderBackground)
		this.onRenderBackground( camera, this );
	else
		this.renderSkybox( camera );

	this.fillGlobalUniforms();

	if(this.onRenderOpaque)
		this.onRenderOpaque( this, renderer, camera );

	//clears render calls list
	this.resetRenderCallsPool();	

	//extract render calls from scene nodes
	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		this.getNodeRenderCalls( node, camera, layers );
	}

	//sort by alpha and distance
	var rcs = this.render_calls.slice(0,this.num_render_calls);
	for(var i = 0; i < rcs.length; ++i)
		rcs[i].computeRenderPriority( camera._position );
	rcs = rcs.sort( PBRPipeline.rc_sort_function );

	//group by instancing?
	//TODO
	//this.groupRenderCallsForInstancing();

	var precompose_opaque = (this.alpha_composite_callback || this.alpha_composite_target_texture) && GL.FBO.current;
	var opaque = true;

	//do the render call for every rcs
	for(var i = 0; i < rcs.length; ++i)
	{
		var rc = rcs[i];
		//store the opaque framebuffer into a separate texture
		if( opaque && precompose_opaque && rc.material.alphaMode == "BLEND")
		{
			opaque = false;
			if(this.alpha_composite_target_texture)
				GL.FBO.current.color_textures[0].copyTo( this.alpha_composite_target_texture );
			if( this.alpha_composite_callback )
				this.alpha_composite_callback( GL.FBO.current, this.alpha_composite_target_texture );
		}
		this.renderMeshWithMaterial( rc.model, rc.mesh, rc.material, rc.index_buffer_name, rc.group_index, rc.node.extra_uniforms, rc.reverse_faces );
	}

	//some useful callbacks
	if(this.onRenderAlpha)
		this.onRenderAlpha( this, this.renderer, camera );

	if(this.onRenderGizmos)
		this.onRenderGizmos( this, this.renderer, camera );

	//if not rendering to viewport, now we must render the buffer to the viewport
	if(this.use_rendertexture && !skip_fbo)
		this.renderFinalBuffer();
}

//after filling the final buffer (from renderForward) it applies FX and tonemmaper
PBRPipeline.prototype.renderFinalBuffer = function()
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

	this.fx_uniforms.u_contrast = this.contrast;
	this.fx_uniforms.u_brightness = this.brightness;
	this.fx_uniforms.u_gamma = this.gamma;

	this.final_texture.toViewport( gl.shaders["tonemapper"], this.fx_uniforms );
}


PBRPipeline.prototype.getNodeRenderCalls = function( node, camera, layers )
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

	if(layers === undefined)
		layers = 0xFFFF;

	//prepare matrix (must be done always or children wont have the right transform)
	node.updateGlobalMatrix(true);

	if(!mesh)
		return;

	if(node.flags.visible === false || !(node.layers & layers) )
		return;

	//check if inside frustum
	if(this.test_visibility)
	{
		if(!PBRPipeline.temp_bbox)
		{
			PBRPipeline.temp_bbox = BBox.create();
			PBRPipeline.aabb_center = BBox.getCenter( PBRPipeline.temp_bbox );
			PBRPipeline.aabb_halfsize = BBox.getHalfsize( PBRPipeline.temp_bbox );
		}
		var aabb = PBRPipeline.temp_bbox;
		BBox.transformMat4( aabb, mesh.getBoundingBox(), node._global_matrix );
		if ( camera.testBox( PBRPipeline.aabb_center, PBRPipeline.aabb_halfsize ) == RD.CLIP_OUTSIDE )
			return;

		node._last_rendered_frame = this.renderer.frame; //mark last visible frame
	}

	//it has multiple submaterials
	if( node.primitives && node.primitives.length )
	{
		for(var i = 0; i < node.primitives.length; ++i)
		{
			var prim = node.primitives[i];
			var material = null;
			if(!prim.material)
				material = this.default_material;
			else
				material = RD.Materials[ prim.material ];
			if(!material)
				continue;

			var rc = this.getRenderCallFromPool();
			rc.material = material;
			rc.model = node._global_matrix;
			rc.mesh = mesh;
			rc.group_index = i;
			rc.node = node;
			rc._render_priority = material.render_priority || 0;
			rc.reverse_faces = node.flags.frontFace == GL.CW;
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
			rc._render_priority = material.render_priority || 0;
			rc.reverse_faces = node.flags.frontFace == GL.CW;
		}
	}
}

PBRPipeline.prototype.groupRenderCallsForInstancing = function()
{
	var groups = {};

	for(var i = 0; i < this.num_render_calls; ++i)
	{
		var rc = this.render_calls[i];
		var key = rc.mesh.name + ":" + rc.group_index + "/" + rc.material.name + (rc.reverse_faces ? "[R]" : "");
		if(!groups[key])
			groups[key] = [rc];
		else
		{
			groups[key].push(rc);
			//console.log("shared!",key);
		}
	}

	for(var i in groups)
		if( groups[i].length > 1 )
			console.log( i, groups[i].length );

}

//places semitransparent meshes the last ones
PBRPipeline.rc_sort_function = function(a,b)
{
	return b._render_priority - a._render_priority;
}

PBRPipeline.prototype.setParallaxReflectionTransform = function( transform )
{
	this.parallax_reflection_matrix.set( transform );
	this.parallax_reflection = true;
	this.global_uniforms.u_cube_reflection_matrix = this.parallax_reflection_matrix;
	mat4.invert( this.parallax_reflection_matrix_inv, this.parallax_reflection_matrix );
	this.global_uniforms.u_inv_cube_reflection_matrix = this.parallax_reflection_matrix_inv;
}

PBRPipeline.prototype.getShader = function( macros, fragment_shader_name )
{
	var container = this.compiled_shaders[fragment_shader_name];
	if(!container)
		container = this.compiled_shaders[fragment_shader_name] = new Map();

	var shader = container.get( macros );
	if(shader)
		return shader;

	if(!this.renderer.shader_files)
		return null;

	var vs = this.renderer.shader_files[ "default.vs" ];
	var fs = this.renderer.shader_files[ fragment_shader_name ];

	var macros_info = null;
	if( macros )
	{
		macros_info = {};
		for( var i in PBRPipeline.MACROS )
		{
			var flag = PBRPipeline.MACROS[i];
			if( macros & flag )
				macros_info[ i ] = "";
		}
	}

	var shader = new GL.Shader( vs, fs, macros_info );
	container.set(macros,shader);
	return shader;
}

PBRPipeline.prototype.renderMeshWithMaterial = function( model, mesh, material, index_buffer_name, group_index, extra_uniforms, reverse_faces )
{
	var renderer = this.renderer;

	var shader = null;

	//not visible
	if(material.alphaMode == "BLEND" && material.color[3] <= 0.0)
		return;

	var material_uniforms = this.material_uniforms;
	var sampler_uniforms = this.sampler_uniforms;

	//materials
	material_uniforms.u_albedo = material.color.subarray(0,3);
	material_uniforms.u_emissive.set( material.emissive || RD.ZERO );
	if(this.emissive_factor != 1.0)
		vec3.scale( material_uniforms.u_emissive, material_uniforms.u_emissive, this.emissive_factor );

	var shader = null;

	var macros = 0;
	if(mesh.vertexBuffers.coords1)
		macros |= PBRPipeline.MACROS.UVS2;
	if(mesh.vertexBuffers.colors)
		macros |= PBRPipeline.MACROS.COLOR;

	if( this.parallax_reflection )
		macros |= PBRPipeline.MACROS.PARALLAX_REFLECTION;

	if( this.overwrite_shader_name )
	{
		shader = gl.shaders[ this.overwrite_shader_name ];
	}
	else if( material.model == "pbrMetallicRoughness" && this.quality )
	{
		material_uniforms.u_metalness = material.metallicFactor;
		material_uniforms.u_roughness = material.roughnessFactor;
		material_uniforms.u_metallicRough = Boolean( material.textures["metallicRoughness"] );
		shader = this.getShader( macros, "pbr.fs" );
	}
	else
	{
		shader = this.getShader( macros, "nopbr.fs" );
	}

	if(!shader)
		return;

	material_uniforms.u_alpha = material.opacity;
	material_uniforms.u_alpha_cutoff = -1; //disabled

	material_uniforms.u_normalFactor = material.normalmapFactor != null ? material.normalmapFactor : 1.0;
	material_uniforms.u_displacement_factor = material.displacementFactor != null ? material.displacementFactor : 1.0;

	//sent as u_texture_matrix
	if(material.uv_transform)
		this.texture_matrix.set( material.uv_transform );
	else
		mat3.identity( this.texture_matrix );

	//textures
	var slot = 2; //skip 0 and 1 as are in use
	var maps_info = material_uniforms.u_maps_info;
	for(var i = 0; i < PBRPipeline.maps.length; ++i)
	{
		var map = PBRPipeline.maps[i];
		maps_info[i] = -1;
		var texture_info = material.textures[ map ];
		if(!texture_info)
			continue;

		var texture_name = null;
		if( texture_info.constructor === Object ) //in case it has properties for this channel
			texture_name = texture_info.texture;
		else if( texture_info.constructor === String ) 
		{
			texture_name = texture_info;
			texture_info = null;
		}
		if(!texture_name)
			continue;

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

		var tex_slot = this.max_textures < 16 ? slot++ : i + 2;
		sampler_uniforms[ texture_uniform_name ] = texture.bind( tex_slot );
		if( texture_info && texture_info.uv_channel != null )
			maps_info[i] = Math.clamp( texture_info.uv_channel, 0, 3 );
		else
			maps_info[i] = 0;
	}

	//flags
	if( !reverse_faces )
		gl.frontFace( GL.CCW );
	renderer.enableItemFlags( material );
	if( reverse_faces )
		gl.frontFace( GL.CW );

	if(material.alphaMode == "BLEND")
	{
		gl.enable(gl.BLEND);
		if(material.additive)
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE );
		else
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
	shader.uniforms( this.global_uniforms ); 
	shader.uniforms( material_uniforms ); //locals
	shader.uniforms( sampler_uniforms ); //locals
	if(extra_uniforms)
		shader.uniforms( extra_uniforms );

	var group = null;
	if( group_index != null && mesh.info && mesh.info.groups && mesh.info.groups[ group_index ] )
		group = mesh.info.groups[ group_index ];

	//hack to render alpha objects first in the depth buffer, and then again (used in very specific cases)
	if(material.flags.preAlpha)
	{
		gl.colorMask(false,false,false,false);
		gl.depthMask( true );
		if(group)
			shader.drawRange( mesh, material.primitive, group.start, group.length, index_buffer_name );
		else
			shader.draw( mesh, material.primitive, index_buffer_name );
		gl.colorMask(true,true,true,true);
		gl.depthFunc( gl.LEQUAL );
	}

	if(group)
		shader.drawRange( mesh, material.primitive, group.start, group.length, index_buffer_name );
	else
		shader.draw( mesh, material.primitive, index_buffer_name );

	renderer.disableItemFlags( material );
	if( reverse_faces )
		gl.frontFace( GL.CCW );

	gl.depthFunc( gl.LESS );
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
	this.last_num_render_calls = this.num_render_calls;
	this.num_render_calls = 0;
}

PBRPipeline.prototype.renderSkybox = function( camera )
{
	//allows to overwrite the skybox rendering
	if( this.onRenderSkybox )
	{
		if( this.onRenderSkybox( this, camera ) )
			return;
	}

	if(!this.environment_texture || !this.render_skybox)
		return;

	//render the environment
	var mesh = gl.meshes["cube"];
	var shader = gl.shaders[ this.overwrite_shader_name || "skybox" ];
	if(!shader)
		return;
	var texture = this.skybox_texture || this.environment_texture;
	if(!texture)
		return;

	gl.disable( gl.CULL_FACE );
	gl.disable( gl.DEPTH_TEST );
	gl.disable( gl.BLEND );
	var model = this.renderer._model_matrix;
	mat4.identity( model );
	mat4.translate( model, model, camera.position );
	mat4.scale( model, model, [10,10,10] );
	this.renderer.setModelMatrix(model);
	shader.uniforms( this.renderer._uniforms );
	shader.uniforms({
		u_color_texture: texture.bind(0),
		u_is_rgbe: false,
		u_exposure: this.exposure,
		u_mipmap_offset: 0,
		u_rotation: this.environment_rotation * DEG2RAD,
		u_camera_position: camera.position
	});
	shader.draw(mesh,GL.TRIANGLES);
}

PBRPipeline.prototype.loadEnvironment = function( url, callback, is_skybox )
{
	var that = this;
	var tex = gl.textures[url];
	if(tex)
	{
		if(is_skybox)
			that.skybox_texture = tex;
		else
		{
			if(tex.shs)
				that.environment_sh_coeffs = tex.shs;
			that.environment_texture = tex;
		}
		if(callback)
			callback(tex);
		return;
	}

	HDRE.load(url, function(data){
		var tex = data.toTexture(true);
		if(tex)
		{
			gl.textures[url] = tex;
			if(is_skybox)
				that.skybox_texture = tex;
			else
			{
				tex.shs = data.shs ? data.shs : null;
				that.environment_texture = tex;
				if(tex.shs)
					that.environment_sh_coeffs = tex.shs;
			}
		}
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

	var shader = gl.shaders["brdf_integrator"];
	if(!shader)
	{
		//console.warn("brdf_integrator shader not found");
		return;
	}

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
	
	var hammersley_tex = gl.textures["hammersley_sample_texture"];
	if(!hammersley_tex)
		hammersley_tex = this.createHammersleySampleTexture();

	tex.drawTo(function(texture) {
		if(hammersley_tex)
			hammersley_tex.bind(0);
		shader.uniforms({		
			u_hammersley_sample_texture: 0
		}).draw( GL.Mesh.getScreenQuad(), gl.TRIANGLES );
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

PBRPipeline.prototype.setClippingPlane = function(P,N)
{
	if(!P)
		this.global_uniforms.u_clipping_plane.set([0,0,0,0]);
	else
		this.global_uniforms.u_clipping_plane.set([N[0],N[1],N[2],vec3.dot(P,N)]);
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
	this.name = "";
	this.id = -1;
	this.mesh = null;
	this.model = null;
	this.index_buffer_name = "triangles";
	this.group_index = -1;
	this.material = null;
	this.reverse_faces = false;

	this.node = null;

	this._render_priority = 0;
}

var temp_vec3 = vec3.create();

RenderCall.prototype.computeRenderPriority = function( point )
{
	this.name = this.node.name;
	var bb = this.mesh.getBoundingBox();
	if(!bb)
		return;
	var pos = mat4.multiplyVec3( temp_vec3, this.model, bb );
	this._render_priority = this.material.render_priority || 0;
	this._render_priority += vec3.distance( point, pos ) * 0.001;
	if(this.material.alphaMode == "BLEND")
		this._render_priority -= 100;
}

RD.PBRPipeline = PBRPipeline;
RD.RenderCall = RenderCall;

})(this);
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

	Light.prototype.setUniforms = function( shader_or_uniforms )
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

})(typeof(window) != "undefined" ? window : (typeof(self) != "undefined" ? self : global ));
//This file contains two animation methods, one for single track animations (used in GLTF)
//and one for a full skeletal animation (which is more efficient when working with skeletal characters)

(function(global){

var RD = global.RD = global.RD || {};

RD.Animations = {};

//Animation contains tracks that contain keyframes
function Animation()
{
	this.name = "";
	this.tracks = [];
	this.duration = 10;
}

Animation.prototype.addTrack = function(track, group)
{
	//search similar
	if(group)
	for(var i = 0; i < this.tracks.length; ++i)
	{
		var t = this.tracks[i];
		if( t.target_node == track.target_node )
		{
			this.tracks.splice(i+1,0,track);
			return;
		}
	}
	this.tracks.push(track);
}

Animation.prototype.applyAnimation = function( root_node, time, interpolation )
{
	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		track.applyTrack( root_node, time, interpolation );
	}
}

Animation.prototype.serialize = function()
{
	var o = {
		name: this.name,
		duration: this.duration,
		tracks: []
	};

	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		o.tracks.push( track.serialize() );
	}	

	return o;
}

Animation.prototype.configure = function(o)
{
	this.name = o.name;
	this.duration = o.duration;
	this.tracks.length = 0;

	for(var i = 0; i < o.tracks.length; ++i)
	{
		var track = new RD.Animation.Track();
		track.configure( o.tracks[i] );
		this.tracks.push( track );
	}	

	return o;
}

Animation.prototype.findNearestLeft = function( time )
{
	var nearest_time = 0;
	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		var index = track.findTimeIndex( time );
		if(index == -1)
			continue;
		var keyframe_time = track.data[index];
		if( keyframe_time > nearest_time )
			nearest_time = keyframe_time;
	}
	return nearest_time;
}

Animation.prototype.findNearestRight = function( time )
{
	var nearest_time = this.duration;
	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		var index = track.findTimeIndex( time );
		if(index == -1)
			continue;
		var keyframe_time = track.data[index + 1];
		if( keyframe_time != null && keyframe_time < nearest_time )
			nearest_time = keyframe_time;
	}
	return nearest_time;
}

RD.Animation = Animation;

function Track()
{
	this.enabled = true;
	this.target_node = ""; //id of target name
	this.target_property = ""; //name of property
	this.type = RD.SCALAR; //value_size per keyframe is derived from this type using RD.TYPES_SIZE[ type ]. 0 means an object/string/boolean
	this.data = [];
	this.packed_data = false;//tells if data is in Array format (easy to manipulate) or Typed Array format (faster)

	this._target = null; //the object that will receive the samples
}

Animation.Track = Track;

Object.defineProperty( Track.prototype, "value_size", {
	set: function(v)
	{
		throw("cannot be set, use type instead");
	},
	get: function()
	{
		return RD.TYPES_SIZE[ this.type ];
	}
});


/**
* Adds a new keyframe to this track given a value
* @method addKeyframe
* @param {Number} time time stamp in seconds
* @param {*} value anything you want to store, if omited then the current value is used
* @param {Boolean} skip_replace if you want to replace existing keyframes at same time stamp or add it next to that
* @return {Number} index of keyframe
*/
Track.prototype.addKeyframe = function( time, value, skip_replace )
{
	var value_size = this.value_size;
	if( value_size > 1 )
		value = new Float32Array( value ); //clone

	//if(this.packed_data)
	//	this.unpackData();

	for(var i = 0; i < this.data.length; ++i)
	{
		if(this.data[i][0] < time )
			continue;
		if(this.data[i][0] == time && !skip_replace )
			this.data[i][1] = value;
		else
			this.data.splice(i,0, [time,value]);
		return i;
	}

	this.data.push( [time,value] );
	return this.data.length - 1;
}

/**
* returns a keyframe given an index
* @method getKeyframe
* @param {Number} index
* @return {Array} the keyframe in [time,data] format
*/
Track.prototype.getKeyframe = function( index )
{
	if(index < 0 || index >= this.data.length)
	{
		console.warn("keyframe index out of bounds");
		return null;
	}

	var value_size = RD.TYPES_SIZE[ this.type ];

	if(this.packed_data)
	{
		var pos = index * (1 + value_size );
		if(pos > (this.data.length - value_size) )
			return null;
		return [ this.data[pos], this.data.subarray(pos+1, pos+value_size+1) ];
		//return this.data.subarray(pos, pos+this.value_size+1) ];
	}

	return this.data[ index ];
}

/**
* Returns nearest index of keyframe with time equal or less to specified time (Dichotimic search)
* @method findTimeIndex
* @param {number} time
* @return {number} the nearest index (lower-bound)
*/
Track.prototype.findTimeIndex = function(time)
{
	var data = this.data;
	if(!data || data.length == 0)
		return -1;

	var value_size = RD.TYPES_SIZE[ this.type ];

	if(this.packed_data)
	{
		var offset = value_size + 1; //data size plus timestamp
		var l = data.length;
		var n = l / offset; //num samples
		var imin = 0;
		var imid = 0;
		var imax = n;

		if(n == 0)
			return -1;
		if(n == 1)
			return 0;

		//time out of duration
		if( data[ (imax - 1) * offset ] < time )
			return (imax - 1);

		//dichotimic search
		// continue searching while [imin,imax] are continuous
		while (imax >= imin)
		{
			// calculate the midpoint for roughly equal partition
			imid = ((imax + imin)*0.5)|0;
			var t = data[ imid * offset ]; //get time
			if( t == time )
				return imid; 
			//when there are no more elements to search
			if( imin == (imax - 1) )
				return imin;
			// determine which subarray to search
			if (t < time)
				// change min index to search upper subarray
				imin = imid;
			else         
				// change max index to search lower subarray
				imax = imid;
		}
		return imid;
	}

	//unpacked data
	var n = data.length; //num samples
	var imin = 0;
	var imid = 0;
	var imax = n;

	if(n == 0)
		return -1;
	if(n == 1)
		return 0;

	//time out of duration
	if( data[ (imax - 1) ][0] < time )
		return (imax - 1);

	while (imax >= imin)
	{
		// calculate the midpoint for roughly equal partition
		imid = ((imax + imin)*0.5)|0;
		var t = data[ imid ][0]; //get time
		if( t == time )
			return imid; 
		//when there are no more elements to search
		if( imin == (imax - 1) )
			return imin;
		// determine which subarray to search
		if (t < time)
			// change min index to search upper subarray
			imin = imid;
		else         
			// change max index to search lower subarray
			imax = imid;
	}

	return imid;
}

//returns value given a time and a interpolation method
Track.prototype.getSample = function( time, interpolate, result )
{
	if(!this.data || this.data.length === 0)
		return undefined;

	if(this.packed_data)
		return this.getSamplePacked( time, interpolate, result );
	return this.getSampleUnpacked( time, interpolate, result );
}

//used when sampling from a unpacked track (where data is an array of arrays)
Track.prototype.getSampleUnpacked = function( time, interpolation, result )
{
	var value_size = RD.TYPES_SIZE[ this.type ];
	var duration = this.data[ this.data.length - 1 ][0];
	time = Math.clamp( time, 0, duration );

	var index = this.findTimeIndex( time );
	if(index === -1)
		index = 0;

	var index_a = index;
	var index_b = index + 1;
	var data = this.data;
	var value_size = RD.TYPES_SIZE[ this.type ];

	if(!interpolation || value_size == 0 || (data.length == 1) || index_b == data.length || (index_a == 0 && this.data[0][0] > time)) //(index_b == this.data.length && !this.looped)
		return this.data[ index ][1];

	var a = data[ index_a ];
	var b = data[ index_b ];

	var t = (b[0] - time) / (b[0] - a[0]);

	//multiple data
	if( value_size > 1 )
	{
		result = result || this._result;
		if( !result || result.length != value_size )
			result = this._result = new Float32Array( value_size );
	}

	if(interpolation === RD.LINEAR)
	{
		if( value_size == 1 )
			return a[1] * t + b[1] * (1-t);

		return RD.interpolateLinear( a[1], b[1], t, result, this.type, value_size, this );
	}
	else if(interpolation === RD.CUBIC)
	{
		var pre_a = index > 0 ? data[ index - 1 ] : a;
		var post_b = index < data.length - 2 ? data[ index + 2 ] : b;

		if(value_size === 1)
			return RD.EvaluateHermiteSpline(a[1],b[1],pre_a[1],post_b[1], 1 - t );

		result = RD.EvaluateHermiteSplineVector( a[1], b[1], pre_a[1], post_b[1], 1 - t, result );

		if(this.type == RD.QUAT)
		{
			quat.slerp( result, b[1], a[1], t ); //force quats without CUBIC interpolation
			quat.normalize( result, result );
		}
		else if(this.type == RD.TRANS10)
		{
			var rotR = result.subarray(3,7);
			var rotA = a[1].subarray(3,7);
			var rotB = b[1].subarray(3,7);
			quat.slerp( rotR, rotB, rotA, t );
			quat.normalize( rotR, rotR );
		}

		return result;
	}

	return null;
}

//used when sampling from a packed track (where data is a typed-array)
Track.prototype.getSamplePacked = function( time, interpolation, result )
{
	if(!this.data.length)
		return null;

	var value_size = RD.TYPES_SIZE[ this.type ];
	var duration = this.data[ this.data.length - value_size - 1 ];
	time = Math.clamp( time, 0, duration );

	var index = this.findTimeIndex( time );
	if(index == -1)
		index = 0;

	var offset = (value_size+1);
	var index_a = index;
	var index_b = index + 1;
	var data = this.data;
	var num_keyframes = data.length / offset;

	if( !interpolation || num_keyframes == 1 || index_b == num_keyframes || (index_a == 0 && this.data[0] > time)) //(index_b == this.data.length && !this.looped)
		return this.getKeyframe( index )[1];

	//multiple data
	if( value_size > 1 )
	{
		result = result || this._result;
		if( !result || result.length != value_size )
			result = this._result = new Float32Array( value_size );
	}

	var a = data.subarray( index_a * offset, (index_a + 1) * offset );
	var b = data.subarray( index_b * offset, (index_b + 1) * offset );

	var t = (b[0] - time) / (b[0] - a[0]);

	if(interpolation === RD.LINEAR)
	{
		if( value_size == 1 ) //simple case
			return a[1] * t + b[1] * (1-t);

		var a_data = a.subarray(1, value_size + 1 );
		var b_data = b.subarray(1, value_size + 1 );
		return RD.interpolateLinear( a_data, b_data, t, result, this.type, value_size, this );
	}
	
	if(interpolation === RD.CUBIC)
	{
		if( value_size === 0 ) //CUBIC not supported in interpolators
			return a[1];

		var pre_a = index > 0 ? data.subarray( (index-1) * offset, (index) * offset ) : a;
		var post_b = index_b < (num_keyframes - 1) ? data.subarray( (index_b+1) * offset, (index_b+2) * offset ) : b;

		if( value_size === 1 )
			return RD.EvaluateHermiteSpline( a[1], b[1], pre_a[1], post_b[1], 1 - t );

		var a_value = a.subarray(1,offset);
		var b_value = b.subarray(1,offset);

		result = RD.EvaluateHermiteSplineVector( a_value, b_value, pre_a.subarray(1,offset), post_b.subarray(1,offset), 1 - t, result );

		if(this.type == RD.QUAT )
		{
			quat.slerp( result, b_value, a_value, t );
			quat.normalize( result, result ); //is necesary?
		}
		else if(this.type == RD.TRANS10 )
		{
			var rotR = result.subarray(3,7);
			var rotA = a_value.subarray(3,7);
			var rotB = b_value.subarray(3,7);
			quat.slerp( rotR, rotB, rotA, t );
			quat.normalize( rotR, rotR ); //is necesary?
		}

		return result;
	}

	return null;
}

//it samples and applies the result to the given node
//root can be a RD.SceneNode or a RD.Skeleton (if skeleton only mat4 work)
Track.prototype.applyTrack = function( root, time, interpolation )
{
	if(!root)
		return;

	var sample = this.getSample( time, interpolation );

	if( root.constructor === RD.SceneNode ) //apply to scene ierarchy
	{
		var node = null;
		if( root.name == this.target_node)
			node = root;
		else
			node = root.findNodeByName( this.target_node );
		if(node)
			node[ this.target_property ] = sample;
	}
	else if( root.constructor === RD.Skeleton )
	{
		var bone = root.getBone( this.target_node );
		if( bone && this.type == RD.MAT4 )
			bone.model.set( sample );
	}

	return sample;
}

Track.prototype.serialize = function()
{
	var o = {
		enabled: this.enabled,
		target_node: this.target_node, 
		target_property: this.target_property, 
		type: this.type,
		data: this.data.concat(), //clone!
		packed_data: this.packed_data
	};
	return o;
}

Track.prototype.configure = function(o)
{
	this.enabled = o.enabled;
	this.target_node = o.target_node;
	this.target_property = o.target_property;
	if(o.property) //in case it comes as "nodename/propname"
	{
		var index = o.property.indexOf("/");
		this.target_node = o.property.substr(0,index);
		this.target_property = o.property.substr(index+1);
	}
	if(o.type != null)
	{
		if(o.type.constructor === String)
			this.type = RD.TYPES[ o.type.toUpperCase() ] || 0;
		else
			this.type = o.type;
	}
	if(o.data.concat)
		this.data = o.data.concat(); //clone!
	else
		this.data = new o.data.constructor( o.data );

	if(o.packed_data)
		this.packed_data = o.packed_data;
	else
		this.packed_data = this.data.constructor !== Array;
}

RD.interpolateLinear = function( a, b, t, result, type, value_size, track )
{
	if(value_size == 1)
		return a * t + b * (1-t);

	result = result || track._result;

	if(!result || result.length != value_size)
		result = track._result = new Float32Array( value_size );

	switch( type )
	{
		case RD.QUAT:
			quat.slerp( result, b, a, t );
			quat.normalize( result, result );
			break;
		case RD.TRANS10: 
			for(var i = 0; i < 3; i++) //this.value_size should be 10
				result[i] = a[i] * t + b[i] * (1-t);
			for(var i = 7; i < 10; i++) //this.value_size should be 10
				result[i] = a[i] * t + b[i] * (1-t);
			var rotA = a.subarray(3,7);
			var rotB = b.subarray(3,7);
			var rotR = result.subarray(3,7);
			quat.slerp( rotR, rotB, rotA, t );
			quat.normalize( rotR, rotR );
			break;
		default:
			for(var i = 0; i < value_size; i++)
				result[i] = a[i] * t + b[i] * (1-t);
	}
	return result;
}

RD.EvaluateHermiteSpline = function( p0, p1, pre_p0, post_p1, s )
{
	var s2 = s * s;
	var s3 = s2 * s;
	var h1 =  2*s3 - 3*s2 + 1;          // calculate basis function 1
	var h2 = -2*s3 + 3*s2;              // calculate basis function 2
	var h3 =   s3 - 2*s2 + s;         // calculate basis function 3
	var h4 =   s3 -  s2;              // calculate basis function 4
	var t0 = p1 - pre_p0;
	var t1 = post_p1 - p0;

	return h1 * p0 + h2 * p1 + h3 * t0 + h4 * t1;
}

RD.EvaluateHermiteSplineVector = function( p0, p1, pre_p0, post_p1, s, result )
{
	result = result || new Float32Array( result.length );

	var s2 = s * s;
	var s3 = s2 * s;
	var h1 =  2*s3 - 3*s2 + 1;          // calculate basis function 1
	var h2 = -2*s3 + 3*s2;              // calculate basis function 2
	var h3 =   s3 - 2*s2 + s;         // calculate basis function 3
	var h4 =   s3 -  s2;              // calculate basis function 4

	for(var i = 0, l = result.length; i < l; ++i)
	{
		var t0 = p1[i] - pre_p0[i];
		var t1 = post_p1[i] - p0[i];
		result[i] = h1 * p0[i] + h2 * p1[i] + h3 * t0 + h4 * t1;
	}

	return result;
}


//FOR SKELETAL ANIMATION, from LiteScene engine

// By Javi Agenjo (@tamat)
// ***************************************
// It uses a filetype called SKANIM, the format is similar to BVH but much more easy to parser
// ASCII Format description:
// HEADER: {duration}, {samples_per_second}, {num_keyframes}, {num_bones}
// FOR EVERY BONE (ordered by hierarchy): B{bone index}, {bone_name}, {bind matrix of bone in mat44}
// KEYFRAMES HEADER: @{num_animated_bones},{index to bone referenced by the first matrix}, {index to bone referenced by the second matrix}, ...
// KEYFRAME: K{time},{mat4},{mat4},{mat4},....

function lerp(a,b,f) { return a*(1.0-f)+b*f; }

if(!Math.lerp)
	Math.lerp = lerp;

function Skeleton()
{
	this.bones = []; //array of bones
	this.global_bone_matrices = []; //internal array of mat4
	this.bones_by_name = new Map(); //map of nodenames => index in the bones array
}

RD.Skeleton = Skeleton;

//more functions after BONE...

//Skeleton.EXTENSION = "skanim";

function Bone()
{
	this.name = "";
	this.model = mat4.create();
	this.parent = -1;
	this.layer = 0;
	this.num_children = 0;
	this.index = -1; //index in the skeleton bones array
	this.children = new Int8Array(16); //max 16 children
}

Skeleton.Bone = Bone;

Bone.prototype.serialize = function()
{
	return {
		name: this.name,
		model: typedArrayToArray( this.model ),
		parent: this.parent,
		layer: this.layer,
		children: this.num_children ? typedArrayToArray( this.children.subarray(0,this.num_children) ) : null
	};
}

Bone.prototype.configure = function(o)
{
	this.name = o.name;
	this.model.set( o.model );
	this.parent = o.parent;
	this.layer = o.layer;
	this.num_children = 0;
	this.index = o.index != null ? o.index : -1;
	if(o.children)
	{
		this.children.set(o.children);
		if(o.children.constructor === Array)
			this.num_children = o.children.length;
		else
			this.num_children = o.num_children;
	}
}

Bone.prototype.copyFrom = Bone.prototype.configure;

//given a bone name and matrix, it multiplies the matrix to the bone
Skeleton.prototype.applyTransformToBones = function(root, transform)
{
	var bone = this.getBone(root);
	if (!bone)
		return;
	mat4.multiply( bone.model, bone.model, transform );
};

Skeleton.prototype.getBone = function(name)
{
	return this.bones[ this.bones_by_name.get(name) ];
}

Skeleton.identity = mat4.create();

Skeleton.prototype.getBoneMatrix = function( name, global )
{
	var index = this.bones_by_name.get(name);
	if( index === undefined )
		return Skeleton.identity;
	if(global)
		return this.global_bone_matrices[ index ];
	return this.bones[ index ].model;
}

//imports skeleton from structure following Rendeer
Skeleton.prototype.importSkeleton = function(root_node)
{
	var bones = this.bones = [];
	var that = this;
	inner_getChilds(root_node);
	this.updateGlobalMatrices();

	function inner_getChilds( node )
	{
		var bone = new Bone();
		bone.name = node.name || node.id;
		bone.model.set( node.model );
		bone.index = bones.length;
		bones.push( bone );
		that.bones_by_name.set( bone.name, bone.index );
		that.global_bone_matrices.push( mat4.create() );

		if(node.children && node.children.length)
		{
			bone.num_children = node.children.length;
			for(var i = 0; i < node.children.length; ++i)
			{
				var b = inner_getChilds( node.children[i] );
				bone.children[i] = b.index;
				b.parent = bone.index;
			}
		}

		return bone;
	}
}

Skeleton.temp_mat4 = mat4.create();
Skeleton.temp_mat43 = Skeleton.temp_mat4.subarray(0,12);

//fills the array with the bones ready for the shader
//simplify allows to store as mat4x3 instead of mat4x4 (because the last column is always 0,0,0,1)
Skeleton.prototype.computeFinalBoneMatrices = function( bone_matrices, mesh, simplify )
{
	if(!this.bones.length || !mesh || !mesh.bones)
		return bone_matrices || [];

	this.updateGlobalMatrices();

	var size = simplify ? mesh.bones.length * 12 : mesh.bones.length * 16;

	if(!bone_matrices || bone_matrices.length != size )
		bone_matrices = new Float32Array( size );

	if(simplify) //convert to mat4x3
	{
		var m = Skeleton.temp_mat4;
		var m43 = Skeleton.temp_mat43;
		for (var i = 0; i < mesh.bones.length; ++i)
		{
			var bone_info = mesh.bones[i];
			mat4.multiply( temp_mat4, this.getBoneMatrix( bone_info[0], true ), bone_info[1] ); //use globals
			if( mesh.bind_matrix )
				mat4.multiply( temp_mat4, temp_mat4, mesh.bind_matrix );
			mat4.transpose( temp_mat4, temp_mat4 );
			bone_matrices.set(m43,i*12);
		}
	}
	else
		for (var i = 0; i < mesh.bones.length; ++i)
		{
			var bone_info = mesh.bones[i];
			var m = bone_matrices.subarray(i*16,i*16+16);
			mat4.multiply( m, this.getBoneMatrix( bone_info[0], true ), bone_info[1] ); //use globals
			if( mesh.bind_matrix )
				mat4.multiply( m, m, mesh.bind_matrix );
		}

	return bone_matrices;
}

//returns an array with the final global bone matrix in the order specified by the mesh, global_model is optional
Skeleton.prototype.computeFinalBoneMatricesAsArray = function( bone_matrices, mesh, global_model )
{
	if(!this.bones.length || !mesh || !mesh.bones)
		return bone_matrices || [];

	this.updateGlobalMatrices();

	bone_matrices = bone_matrices || [];
	bone_matrices.length = mesh.bones.length;

	for (var i = 0; i < mesh.bones.length; ++i)
	{
		var bone_info = mesh.bones[i];
		if(!bone_matrices[i])
			bone_matrices[i] = mat4.create();
		var m = bone_matrices[i];
		mat4.multiply( m, this.getBoneMatrix( bone_info[0], true ), bone_info[1] ); //use globals
		if(mesh.bind_matrix)
			mat4.multiply( m, m, mesh.bind_matrix );
		if(global_model)
			mat4.multiply( m, global_model, m );
	}

	return bone_matrices;
}

//updates the list of global matrices according to the local matrices
Skeleton.prototype.updateGlobalMatrices = function()
{
	var bones = this.bones;
	if(!bones.length)
		return;

	var num_bones = this.bones.length;

	//compute global matrices
	this.global_bone_matrices[0].set( bones[0].model );
	//order dependant
	for (var i = 1; i < num_bones; ++i)
	{
		var bone = bones[i];
		mat4.multiply( this.global_bone_matrices[i], this.global_bone_matrices[ bone.parent ], bone.model );
	}
}

//assigns a layer to a node and all its children
Skeleton.prototype.assignLayer = function(bone, layer)
{
	//TODO
}

//applies any transform found in the animation tracks to this skeleton
Skeleton.prototype.applyTracksAnimation = function( animation, time )
{
	for(var i = 0; i < animation.tracks.length; ++i )
	{
		var track = animation.tracks[i];
		var bone_index = this.bones_by_name.get( track.target_node );
		if(bone_index == null)
			continue;
		var bone = this.bones[ bone_index ];
		if( track.target_property == "model" || track.target_property == "matrix" )
			track.getSample( time, RD.LINEAR, bone.model );
	}
}

//for rendering the skeleton, it returns an array of pairs vertices to define lines
//if matrix then lines have the matrix applied
Skeleton.prototype.getVertices = function( matrix, skip_update_global )
{
	if(!this.bones.length)
		return null;

	if(!skip_update_global)
		this.updateGlobalMatrices();

	var size = (this.bones.length - 1) * 3 * 2;
	if(!this._vertices || this._vertices.length != size)
		this._vertices = new Float32Array( size );
	var vertices = this._vertices;
	var iv = 0;
	for (var i = 1; i < this.bones.length; ++i)
	{
		var bone = this.bones[i];
		var parent_global_matrix = this.global_bone_matrices[ bone.parent ];
		var global_matrix = this.global_bone_matrices[i];
		var v1 = vertices.subarray(iv,iv+3);
		var v2 = vertices.subarray(iv+3,iv+6);
		mat4.getTranslation( v1, global_matrix );
		mat4.getTranslation( v2, parent_global_matrix );
		if(matrix)
		{
			vec3.transformMat4(v1,v1,matrix);
			vec3.transformMat4(v2,v2,matrix);
		}
		iv += 6;
	}
	return vertices;
}

Skeleton.prototype.resizeBones = function(num)
{
	if(this.bones.length == num)
		return;
	if(this.bones.length > num)
	{
		this.bones.length = num;
		this.global_bone_matrices.length = num;
		return;
	}

	var old_num = this.bones.length;
	this.bones.length = num;
	for(var i = old_num; i < num; ++i)
	{
		this.bones[i] = new Bone();
		this.global_bone_matrices[i] = mat4.create();
	}
}

//clones one skeleton into another
Skeleton.prototype.copyFrom = function( skeleton )
{
	this.resizeBones( skeleton.bones.length );
	for(var i = 0; i < skeleton.bones.length; ++i)
	{
		this.bones[i].copyFrom( skeleton.bones[i] );
		this.global_bone_matrices[i].set( skeleton.global_bone_matrices[i] );
	}
	this.bones_by_name = new Map( skeleton.bones_by_name );
}

Skeleton.prototype.serialize = function()
{
	var o = {
		bones: [],
		bone_names: {}
	};

	for(var i = 0; i < this.bones.length; ++i)
		o.bones.push(this.bones[i].serialize());
	return o;
}

Skeleton.prototype.configure = function(o)
{
	this.resizeBones( o.bones.length );
	if(o.bones_by_name)
		this.bones_by_name = new Map( o.bones_by_name );
	else
		this.bones_by_name.clear();
	for(var i = 0; i < o.bones.length; ++i)
	{
		var bone = this.bones[i];
		bone.copyFrom( o.bones[i] );
		bone.index = i;
		if(o.global_bone_matrices) //is an skeleton
			this.global_bone_matrices[i].set( o.global_bone_matrices[i] );
		else //is an object
			this.bones_by_name.set( this.bones[i].name, i );
	}
}

var temp_axis = vec3.create();

//blends between two skeletons
Skeleton.blend = function(a, b, w, result, layer, skip_normalize )
{
	if(a.bones.length != b.bones.length)
	{
		console.error("skeleton must contain the same number of bones");
		return;
	}

	w = Math.clamp(w, 0.0, 1.0);//safety

	if (layer == 0xFF)
	{
		if (w == 0.0)
		{
			if(result == a) //nothing to do
				return;
			result.copyFrom(a); //copy A in Result
			return;
		}
		if (w == 1.0) //copy B in result
		{
			result.copyFrom(b);
			return;
		}
	}

	if (result != a) //copy bone names
	{
		result.resizeBones( a.bones.length );
		for (var i = 0; i < result.bones.length; ++i)
		{
			var bo = result.bones[i];
			if(!bo)
				bo = result.bones[i] = new Skeleton.Bone();
			bo.copyFrom(a.bones[i]);
		}
		result.bones_by_name = new Map(a.bones_by_name); //TODO: IMPROVE!
	}

	//blend bones locally
	for (var i = 0; i < result.bones.length; ++i)
	{
		var bone = result.bones[i];
		var boneA = a.bones[i];
		var boneB = b.bones[i];
		//if ( layer != 0xFF && !(bone.layer & layer) ) //not in the same layer
		//	continue;
		for (var j = 0; j < 16; ++j)
			bone.model[j] = Math.lerp( boneA.model[j], boneB.model[j], w);

		if(!skip_normalize)
		{
			var m = bone.model;
			//not sure which one is the right one, row major or column major
			//vec3.normalize(m.subarray(0,3),	m.subarray(0,3) );
			//vec3.normalize(m.subarray(4,7),	m.subarray(4,7) );
			//vec3.normalize(m.subarray(8,11), m.subarray(8,11) );
			//*
			for(var j = 0; j < 3; ++j)
			{
				temp_axis[0] = m[0+j]; temp_axis[1] = m[4+j]; temp_axis[2] = m[8+j];
				vec3.normalize(temp_axis,temp_axis);
				m[0+j] = temp_axis[0]; m[4+j] = temp_axis[1]; m[8+j] = temp_axis[2];
			}
			//*/
		}
	}
}

//shader block to include
Skeleton.shader_code = '\n\
	attribute vec4 a_bone_indices;\n\
	attribute vec4 a_weights;\n\
	uniform mat4 u_bones[64];\n\
	void computeSkinning(inout vec3 vertex, inout vec3 normal)\n\
	{\n\
		vec4 v = vec4(vertex,1.0);\n\
		vertex = (u_bones[int(a_bone_indices.x)] * a_weights.x * v + \n\
				u_bones[int(a_bone_indices.y)] * a_weights.y * v + \n\
				u_bones[int(a_bone_indices.z)] * a_weights.z * v + \n\
				u_bones[int(a_bone_indices.w)] * a_weights.w * v).xyz;\n\
		vec4 N = vec4(normal,0.0);\n\
		normal =	(u_bones[int(a_bone_indices.x)] * a_weights.x * N + \n\
				u_bones[int(a_bone_indices.y)] * a_weights.y * N + \n\
				u_bones[int(a_bone_indices.z)] * a_weights.z * N + \n\
				u_bones[int(a_bone_indices.w)] * a_weights.w * N).xyz;\n\
		normal = normalize(normal);\n\
	}\n\
';

//example of full vertex shader that supports skinning
Skeleton.vertex_shader_code = "\n\
	precision highp float;\n\
	attribute vec3 a_vertex;\n\
	attribute vec3 a_normal;\n\
	attribute vec2 a_coord;\n\
	\n\
	varying vec3 v_wPosition;\n\
	varying vec3 v_wNormal;\n\
	varying vec2 v_coord;\n\
	\n\
	uniform mat4 u_viewprojection;\n\
	uniform mat4 u_model;\n\
	uniform mat4 u_normal_matrix;\n\
	\n\
	"+Skeleton.shader_code+"\n\
	\n\
	void main() {\n\
		v_wPosition = a_vertex;\n\
		v_wNormal = (u_normal_matrix * vec4(a_normal,0.0)).xyz;\n\
		v_coord = a_coord;\n\
		\n\
		computeSkinning( v_wPosition, v_wNormal);\n\
		\n\
		v_wPosition = (u_model * vec4(v_wPosition,1.0)).xyz;\n\
		\n\
		gl_Position = u_viewprojection * vec4( v_wPosition, 1.0 );\n\
	}\n\
";

//*******************************************************

//This stores a series of skeleton poses, in constant intervals, this is less memory efficient but has better performance
function SkeletalAnimation()
{
	this.skeleton = new Skeleton();

	this.duration = 0;
	this.samples_per_second = 30;
	this.num_animated_bones = 0;
	this.num_keyframes = 0;

	//maps from keyframe data bone index to skeleton bone index because it may be that not all skeleton bones are animated
	this.bones_map = new Uint8Array(64);  //this.bones_map[ i ] => skeleton.bones[ bone_index ]

	this.keyframes = null; //bidimensional array of mat4, it contains a num.bones X num. keyframes, bones in local space
}

RD.SkeletalAnimation = SkeletalAnimation;

SkeletalAnimation.prototype.load = function(url, callback)
{
	var that =  this;
	return HttpRequest(url, null, function(data) {
		that.fromData(data);
		if(callback)
			callback(that);
	});
}

//change the skeleton to the given pose according to time
SkeletalAnimation.prototype.assignTime = function(time, loop, interpolate, layers )
{
	if(!this.duration || !this.samples_per_second)
		return;

	if (loop || loop === undefined)
	{
		time = time % this.duration;
		if (time < 0)
			time = this.duration + time;
	}
	else
		time = Math.clamp( time, 0.0, this.duration - (1.0/this.samples_per_second) );

	if(interpolate === undefined)
		interpolate = true;

	var v = this.samples_per_second * time;
	var index = Math.floor(v);
	var index2 = (index + 1) % this.num_keyframes;
	index = index % this.num_keyframes;
	var f = v - Math.floor(v);
	var num_animated_bones = this.num_animated_bones;

	var offset = 16 * num_animated_bones;
	var k = index * offset;
	var k2 = index2 * offset;
	var skeleton = this.skeleton;
	var keyframes = this.keyframes;
	var bones_map = this.bones_map;

	//compute local bones
	for (var i = 0; i < num_animated_bones; ++i)
	{
		var bone_index = bones_map[i];
		var bone = skeleton.bones[bone_index];
		if(!bone)
			throw("bone not found in skeleton");
		var offset = i*16;
		//if (layers != 0xFF && !(bone.layer & layers))
		//	continue;
		if(!interpolate)
			bone.model.set( keyframes.subarray( k + offset, k + offset + 16) );
		else
			for (var j = 0; j < 16; ++j)
			{
				//lerp matrix
				bone.model[j] = lerp( keyframes[ k + offset + j ], keyframes[ k2 + offset + j ], f );
			}
	}
}

SkeletalAnimation.prototype.resize = function( num_keyframes, num_animated_bones )
{
	this.num_keyframes = Math.floor(num_keyframes);
	this.num_animated_bones = num_animated_bones;
	this.keyframes = new Float32Array( num_keyframes * num_animated_bones * 16);
}

SkeletalAnimation.prototype.assignPoseToKeyframe = function( skeleton, index )
{
	if( index >= this.num_keyframes )
		throw( "index is out of range, this skeletal animation doesnt have so many samples, resize first" );
	var start_index = index * this.num_animated_bones * 16;

	for(var i = 0; i < this.num_animated_bones; ++i)
	{
		var bone_index = this.bones_map[i];
		var bone = skeleton.bones[bone_index];
		if(bone == null)
			continue;
		this.keyframes.set( bone.model, start_index + i * 16 );
	}
}

SkeletalAnimation.prototype.fromData = function(txt)
{
	var lines = txt.split("\n");
	var header = lines[0].split(",");
	this.duration = Number(header[0]);
	this.samples_per_second = Number(header[1]);
	this.num_keyframes = Number(header[2]);
	
	this.skeleton.resizeBones( Number(header[3]) );
	var current_keyframe = 0;
	for(var i = 1; i < lines.length; ++i)
	{
		var line = lines[i];
		var type = line[0];
		var t = line.substr(1).split(",");
		if( type == 'B')
		{
			var index = Number(t[0]);
			var bone = this.skeleton.bones[index];
			if(!bone)
				throw("bone not found in skeleton"); 
			bone.name = t[1];
			bone.parent = Number(t[2]);
			for(var j = 0; j < 16; ++j)
				bone.model[j] = Number(t[3+j]);
			if (bone.parent != -1)
			{
				var parent_bone = this.skeleton.bones[ bone.parent ];
				if(parent_bone.num_children >= 16)
					console.warn("too many child bones, max is 16");
				else
					parent_bone.children[ parent_bone.num_children++ ] = index;
			}
			this.skeleton.bones_by_name.set(bone.name,index);
		}
		else if( type == '@')
		{
			this.num_animated_bones = Number(t[0]);
			for(var j = 0; j < this.num_animated_bones; ++j)
				this.bones_map[j] = Number(t[j+1]);
			this.resize( this.num_keyframes, this.num_animated_bones );
		}
		else if( type == 'K')
		{
			var pos = current_keyframe * this.num_animated_bones * 16;
			for(var j = 0, l = this.num_animated_bones * 16; j < l; ++j)
				this.keyframes[ pos + j ] = Number( t[j+1] );
			current_keyframe++;
		}
		else 
			break;
	}

	this.assignTime(0,false,false);
}

SkeletalAnimation.prototype.toData = function()
{
	var lines = [];
	lines.push( [ this.duration.toFixed(3), this.samples_per_second, this.num_keyframes, this.skeleton.bones.length ].join(",") );

	var bones = this.skeleton.bones;
	for(var i = 0; i < bones.length; ++i)
	{
		var bone = bones[i];
		lines.push( "B" + i + "," + bone.name + "," + bone.parent + "," + typedArrayToArray(bone.model) );
	}

	//write bones
	var bones_indices = [];
	for(var i = 0; i < this.num_animated_bones; ++i)
		bones_indices.push( this.bones_map[i] );
	lines.push( "@" + bones_indices.length + "," + bones_indices.join(",") );

	var offset = 1/this.samples_per_second;

	//write keyframes for every sample
	for(var i = 0; i < this.num_keyframes; ++i)
	{
		var pos = i * 16 * this.num_animated_bones;

		//get keyframe
		var data = this.keyframes.subarray(pos, pos + 16 * this.num_animated_bones);
		var flat_data = data;

		//avoid ugly strings
		for(var j = 0; j < flat_data.length; ++j)
			if( Math.abs( flat_data[j] ) < 0.000001 )
				flat_data[j] = 0;
			
		lines.push( "K" + (i * offset).toFixed(3) + "," + flat_data.join(",") );
	}

	return lines.join("\n");
}

//resamples the tracks to get poses over time
SkeletalAnimation.prototype.fromTracksAnimation = function( skeleton, animation, frames_per_second )
{
	this.duration = animation.duration;
	this.samples_per_second = frames_per_second;
	this.skeleton.copyFrom( skeleton );

	//count animated bones and update bones map
	var num_animated_bones = 0;
	for(var i = 0; i < animation.tracks.length; ++i )
	{
		var track = animation.tracks[i];
		var bone_index = skeleton.bones_by_name.get( track.target_node );
		if(bone_index == null) //track is not for a bone
			continue;
		//var bone = skeleton.bones[ bone_index ];
		this.bones_map[ num_animated_bones ] = bone_index; //store to which bone is the N matrix in the keyframes
		num_animated_bones++;
	}

	//return;

	//make room for the keyframes
	var num_frames = Math.floor(animation.duration * frames_per_second);
	this.resize( num_frames, num_animated_bones );

	//for every keyframe, sample the skeleton
	for(var i = 0; i < this.num_keyframes; ++i) 
	{
		var t = i * (1/frames_per_second);
		this.skeleton.applyTracksAnimation( animation, t );
		this.assignPoseToKeyframe( this.skeleton, i );
	}
}

if(RD.SceneNode)
{
	RD.SceneNode.prototype.assignSkeleton = function( skeleton )
	{
		var mesh = gl.meshes[ this.mesh ];
		if(!mesh)
			return;
		this.bones = skeleton.computeFinalBoneMatrices( this.bones, mesh );
		this.uniforms.u_bones = this.bones;
	}

	RD.SceneNode.prototype.assignAnimation = function( skeletal_animation )
	{
		this.assignSkeleton( skeletal_animation.skeleton );
	}
}

//footer
})( typeof(window) != "undefined" ? window : (typeof(self) != "undefined" ? self : global ) );

