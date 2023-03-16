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
RD.TRANS10_IDENTITY = new Float32Array([0,0,0, 0,0,0,1, 1,1,1]);

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
RD.STRING = 9;

RD.TYPES = { "NUMBER":RD.NUMBER, "SCALAR":RD.NUMBER, "VEC2":RD.VEC2, "VEC3":RD.VEC3, "VEC4":RD.VEC4, "QUAT":RD.QUAT, "MAT3":RD.MAT3, "TRANS10":RD.TRANS10, "MAT4":RD.MAT4, "STRING":RD.STRING };
RD.TYPES_SIZE = [0,1,2,3,4,4,9,10,16,0];

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

SceneNode["@position"] = { type: "vec3" };
SceneNode["@rotation"] = { type: "quat" }; //for tween

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
		quat.normalize(this._rotation, this._rotation ); //ensure it is not deformed
		this._must_update_matrix = true; },
	enumerable: true
});

Object.defineProperty( SceneNode.prototype, 'matrix', {
	get: function() { return this._local_matrix; },
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

//to work with tween
Object.defineProperty(SceneNode.prototype, 'mustUpdate', {
	get: function() { return this._must_update_matrix; },
	set: function(v) { 
		if(v)
			this._must_update_matrix = true; 	
	},
	enumerable: false
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
* This number is the 4� component of color but can be accessed directly 
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

	return this; //to chain
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
		return this;

	var pos = this.children.indexOf(node);
	if(pos == -1)
		throw("removeChild: impossible, should be children");

	this.children.splice(pos,1);
	node._parent = null;
	if( keep_transform )
		node.fromMatrix( node._global_matrix );
	else
		node._global_matrix.set( node._local_matrix );

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

	return this;
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
* Remove this node from its parent
* @method remove
*/
SceneNode.prototype.remove = function()
{
	if(!this._parent)
		return;
	this._parent.removeChild( this );
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
	if(layers == null)
		layers = 0xFFFF;

	if(!this.children)
		return result;

	if(this.flags.visible === false)
		return result;

	for(var i = 0, l = this.children.length; i < l; i++)
	{
		var node = this.children[i];
		if(node.flags.visible === false)
			continue;
		var in_layer = (node.layers & layers);
		if(layers_affect_children && !in_layer)
			continue;
		if(in_layer)
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
		r.primitives = this.primitives.map(function(a){ return Object.assign({}, a); }); //clone first level
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
	if(this.animations) //clone anims
	{
		r.animations = [];
		for(var i = 0; i < this.animations.length; ++i)
			r.animations.push( this.animations[i].serialize() );
	}
	if(this.skin)
	{
		r.skin = {};
		r.skin.joints = this.skin.joints.concat();
		r.skin.skeleton_root = this.skin.skeleton_root;
		r.skin.bindMatrices = [];
		for(var i = 0; i < this.skin.bindMatrices.length; ++i)
			r.skin.bindMatrices.push( typedArrayToArray(this.skin.bindMatrices[i]) );
	}
	if(this.skeleton)
		r.skeleton = this.skeleton.serialize();

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
				vec3.copy( this._scale, [1,1,1] ); //reset first
				this.scale(o[i]);
				continue;
			case "tiling":
				if( isNumber( o[i] ) )
					this.setTextureTiling(o[i],o[i]);
				else
					this.setTextureTiling(o[i][0],o[i][1],o[i][2],o[i][3]);
				continue;
			case "skeleton":
				var skeleton = new RD.Skeleton();
				skeleton.configure(o[i]);
				this.skeleton = skeleton;
				continue;
			case "animations":
				this.animations = [];
				for(var j = 0; j < o.animations.length; ++j)
				{
					var anim = new RD.Animation();
					anim.configure( o.animations[j] );
					this.animations.push( anim );
				}
				continue;
			case "primitives":
				this.primitives = o.primitives.map(function(a){ return Object.assign({}, a); }); //clone first level
				continue;
			case "name":
			case "mesh":
			case "material":
			case "ref":
			case "draw_range":
			case "submesh":
			case "skin":
			case "extra":
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
		this.getGlobalVector( delta, temp_vec3 );
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
* Assigns rotation based on euler angles
* @method rotate
* @param {number|vec3} yaw or euler (rotation in Y)  in radians
* @param {number} pitch (rotation in X)  in radians
* @param {number} roll (rotation in Z)  in radians
*/
SceneNode.prototype.setEulerRotation = function(yaw,pitch,roll)
{
	if(yaw && yaw.length >= 3)
		quat.fromEuler( this._rotation, yaw);
	else
		quat.fromEuler( this._rotation, [yaw,pitch,roll]);
	this._must_update_matrix = true;
}

SceneNode.prototype.setRotationFromEuler = SceneNode.prototype.setEulerRotation;


/**
* returns a vec3 decomposition of .rotation in euler format [yaw,pitch,roll]
* @method rotate
* @param {vec3} out [optional]  in radians
*/
SceneNode.prototype.getEulerRotation = function(out)
{
	out = out || vec3.create();
	quat.toEuler(out,this._rotation);
	return out;
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
SceneNode.prototype.orientTo = function( v, reverse, up, in_local_space, cylindrical )
{
	var pos = this.getGlobalPosition();
	//build unitary vectors
	var front = vec3.create();
	if( in_local_space ) 
		front.set( v );
	else
		vec3.sub( front, pos, v );

	if(cylindrical) //flatten
		front[1] = 0;

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
* @param {Boolean} fast [optional] it will skip computing the whole ierarchy and reuse the latest stored global matrix (it could be outdated)
* @return {mat4} matrix44 
*/
SceneNode.prototype.getGlobalMatrix = function(out, fast)
{
	this.updateGlobalMatrix( fast );
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
* Returns a point rotated by the local rotation (relative to its parent)
* @method getParentVector
* @param {vec3} v the point
* @param {vec3} [result=vec3] where to store the output
* @return {vec3} result
*/
SceneNode.prototype.getParentVector = function(v, result)
{
	result = result || vec3.create();
	return vec3.transformQuat( result, v, this._rotation );
}

//LEGACY
SceneNode.prototype.getLocalVector = function(v)
{
	console.error("DEPRECATED: SceneNode.prototype.getLocalVector, use getGlobalVector or getParentVector");
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
* Returns a point from local coordinates to global (multiplied by the global matrix)
* @method localToGlobal
* @param {vec3} v the point
* @param {vec3} [result=vec3] where to store the output
* @param {vec3} fast [Boolean] if true uses the last global matrix computed instead of recomputing it (but it could be outdated)
* @return {vec3} result
*/
SceneNode.prototype.localToGlobal = function(v, result, fast)
{
	result = result || vec3.create();
	var m = this.getGlobalMatrix( null, fast );
	return vec3.transformMat4(result, v, m );	
}

SceneNode.prototype.getGlobalPoint = SceneNode.prototype.localToGlobal;

/**
* Transform a point from global coordinates to local coordinates
* @method globalToLocal
* @param {vec3} v the point
* @param {vec3} [result=vec3] where to store the output
* @return {vec3} result
*/
SceneNode.prototype.globalToLocal = function(v,result)
{
	result = result || vec3.create();
	var m = this.getGlobalMatrix();
	mat4.invert(temp_mat4,m);
	return vec3.transformMat4(result, v, temp_mat4 );
}

/**
* Transform a vector from global coordinates to local coordinates
* @method globalVectorToLocal
* @param {vec3} v the point
* @param {vec3} [result=vec3] where to store the output
* @return {vec3} result
*/
SceneNode.prototype.globalVectorToLocal = function(v,result)
{
	result = result || vec3.create();
	var q = this.getGlobalRotation();
	quat.invert(q,q);
	return vec3.transformQuat( result, v, q );
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
	var q = this.getGlobalRotation(temp_quat);
	return vec3.transformQuat( result, v, q );
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
	if(layers == null)
		layers = 0xFFFF;
	result = result || [];

	for(var i = 0, l = this.children.length; i < l; i++)
	{
		var node = this.children[i];
		if( !(node.layers & layers) )
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
		if(!node) //�?
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
		{
			bb = this.bounding_box = BBox.create();
			bb.set( child_bb );
		}
		else
			BBox.merge( bb, bb, child_bb );
	}

	return bb;
}

/**
* returns the N material
* @method getMaterial
* @param { Number } index
* @return { RD.Material } the material or null if not found
*/
SceneNode.prototype.getMaterial = function(index)
{
	index = index || 0;

	if(this.material)
		return RD.Materials[this.material];
	if( this.primitives && this.primitives.length > index)
		return RD.Materials[this.primitives[index].material];
	return null;
}

/**
* sets one bit of the layer to some value
* @method setLayerBit
* @param { Number } bit number
* @param { boolean } value true or false
*/
SceneNode.prototype.setLayerBit = function( bit_num, value )
{
	var f = 1<<bit_num;
	this.layers = (this.layers & (~f));
	if(value)
		this.layers |= f;
}

/**
* checks if this node is in the given layer
* @method isInLayer
* @param {number} layer number that specifies the layer bit
* @return {boolean} true if belongs to this layer
*/
SceneNode.prototype.isInLayerBit = function( bit_num )
{
	return (this.layers & (1<<bit_num)) !== 0;
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
		max_dist = max_dist == null ? Number.MAX_VALUE : max_dist;
		if(layers == null)
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
		for(var i = 0, l = this.children.length; i < l; ++i )
		{
			var child = this.children[i];
			var child_collided = child.testRay( ray, local_result, max_dist, layers, test_against_mesh );
			if(!child_collided)
				continue;

			var distance = vec3.distance( ray.origin, local_result );
			if( distance > max_dist )
				continue;

			max_dist = distance;
			result.set( local_result );
			node = child_collided;
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
	var gmatrix = mat4.create();
	var inv = mat4.create();

	return function( ray, coll_point, max_dist, layers, test_against_mesh )
	{
		if( !this.mesh )
			return false;

		var mesh = gl.meshes[ this.mesh ];
		if( !mesh || mesh.ready === false) //mesh not loaded
			return false;

		var group_index = this.submesh == null ? -1 : this.submesh;

		//ray to local
		//Warning: if you use this._global_matrix and the object wasnt visible, it wont have the matrix updated
		var model = this.getGlobalMatrix(gmatrix,true); 
		mat4.invert( inv, model );
		vec3.transformMat4( origin, ray.origin, inv );
		vec3.add( end, ray.origin, ray.direction );
		vec3.transformMat4( end, end, inv );
		vec3.sub( direction, end, origin );
		vec3.normalize( direction, direction );

		var two_sided = this.flags.two_sided;

		if( this.primitives && this.primitives.length )
		{
			var material = RD.Materials[ this.primitives[0].material ];
			if(material)
				two_sided = material.flags.two_sided;
		}

		return RD.testRayMesh( ray, origin, direction, model, mesh, group_index, coll_point, max_dist, layers, test_against_mesh, two_sided );
	}
})();

/**
* Tests if the ray collides with this node mesh or the childrens
* @method testSphere
* @param { vec3 } center center of sphere
* @param { Number } radius 
* @param { Number } layers the layers bitmask where you want to test
* @param { Boolean } test_against_mesh if true it will test collision with mesh, otherwise only boundings
* @return { RD.SceneNode } the node where it collided
*/
SceneNode.prototype.testSphere = (function(){ 

	return function( center, radius, layers, test_against_mesh )
	{
		if(layers == null)
			layers = 0xFFFF;

		//test with this node mesh 
		var collided = null;
		if(this.flags.visible === false)
			return null;

		if( (this.layers & layers) && !this.flags.ignore_collisions )
		{
			if( this.mesh )
				collided = this.testSphereWithMesh( center, radius, layers, test_against_mesh );
		}

		//update closest point if there was a collision
		if(collided)
			return this;

		//if no children, then return current collision
		if( !this.children || !this.children.length )
			return null;

		//test against children
		for(var i = 0, l = this.children.length; i < l; ++i )
		{
			var child = this.children[i];
			var child_collided = child.testSphere( center, radius, layers, test_against_mesh );
			if(child_collided)
				return child_collided;
		}
		
		return null;
	}
})();

/**
* Tests if the ray collides with the mesh in this node
* @method testSphereWithMesh
* @param { vec3 } center the center of the sphere
* @param { Number } radius the radius of the sphere
* @param { Number } layers the layers where you want to test
* @param { Boolean } test_against_mesh if true it will test collision with mesh, otherwise only bounding
* @return { Boolean } true if it collided
*/
SceneNode.prototype.testSphereWithMesh = (function(){ 
	var local_center = vec3.create();
	var direction = vec3.create();
	var end = vec3.create();
	var gmatrix = mat4.create();
	var inv = mat4.create();

	return function( center, radius, layers, test_against_mesh )
	{
		if( !this.mesh )
			return false;

		var mesh = gl.meshes[ this.mesh ];
		if( !mesh || mesh.ready === false) //mesh not loaded
			return false;
		var group_index = this.submesh == null ? -1 : this.submesh;

		//Warning: if you use this._global_matrix and the object wasnt visible, it wont have the matrix updated
		var model = this.getGlobalMatrix(gmatrix,true); 
		mat4.invert( inv, model );
		vec3.transformMat4( local_center, center, inv );
		var local_radius = radius / vec3.length(model); //reads the first three elements
		var two_sided = this.flags.two_sided;

		if( this.primitives && this.primitives.length )
		{
			var material = RD.Materials[ this.primitives[0].material ];
			if(material)
				two_sided = material.flags.two_sided;
		}

		return RD.testSphereMesh( local_center, local_radius, model, mesh, group_index, layers, test_against_mesh, two_sided );
	}
})();

/**
* adjust the rendering range so it renders one specific submesh of the mesh
* @method setRangeFromSubmesh
* @param {String} submesh_id could be the index or the string with the name
*/
SceneNode.prototype.setRangeFromSubmesh = function( submesh_id )
{
	if(submesh_id == null || !this.mesh)
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
	if(layers == null)
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
	if(this._position == target) //special case
		target = vec3.clone( target );
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
	if(this._must_update_matrix)
		this.updateMatrices();
	//mat4.invert(this._model_matrix, this._view_matrix ); //already done when updateMatrices
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
* transform point from local to global coordinates
* @method localToGlobal
* @param {vec3} v
* @param {vec3} result [Optional]
* @return {vec3} local point transformed
*/
Camera.prototype.localToGlobal = function(v, result)
{
	if(this._must_update_matrix)
		this.updateMatrices();
	
	return vec3.transformMat4( result || vec3.create(), v, this._model_matrix );
}

Camera.prototype.getLocalPoint = Camera.prototype.localToGlobal;

/**
* transform point from global coordinates (world space) to local coordinates (view space)
* @method globalToLocal
* @param {vec3} v
* @param {vec3} result [Optional]
* @return {vec3} local point
*/
Camera.prototype.globalToLocal = function(v, result)
{
	if(this._must_update_matrix)
		this.updateMatrices();
	return vec3.transformMat4( result || vec3.create(), v, this._view_matrix );
}

/**
* transform vector from global coordinates (world space) to local coordinates (view space) taking into account only rotation and scaling
* @method globalVectorToLocal
* @param {vec3} v
* @param {vec3} result [Optional]
* @return {vec3} local vector
*/
Camera.prototype.globalVectorToLocal = function(v, result)
{
	if(this._must_update_matrix)
		this.updateMatrices();
	return mat4.rotateVec3( result || vec3.create(), this._view_matrix, v );
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
* returns the size in screenspace of a sphere set in a position
* @method computeProjectedRadius
* @param {vec3} vec center of sphere
* @param {Number} radius radius of sphere
* @param {vec4} viewport [optional]
* @param {Boolean} billboarded [optional] in case you want the billboarded projection
* @return {Number} radius
*/
Camera.prototype.computeProjectedRadius = function( center, radius, viewport, billboarded )
{
	viewport = viewport || gl.viewport_data;

	//billboarded circle
	if(billboarded)
	{
		var v = vec4.create();
		v.set( center );
		v[3] = 1;
		var proj = vec4.transformMat4( v, v, this._viewprojection_matrix );
		return Math.max( 1.0, viewport[3] * this._projection_matrix[5] * radius / proj[3] );
	}

	//from https://stackoverflow.com/questions/21648630/radius-of-projected-sphere-in-screen-space
	if(this.type == RD.Camera.ORTHOGRAPHIC)
		return radius / ( this._frustum_size.constructor === Number ? this._frustum_size : 1 ) * viewport[3] / 2;
	var d = vec3.distance( center, this.position ); //true distance
	if(d == 0)
		return 0;
	var fov = this.fov / 2 * Math.PI / 180.0;
	var pr = (1.0 / Math.tan(fov) * radius / Math.sqrt(d * d - radius * radius)); //good
	//var pr = 1.0 / Math.tan(fov) * radius / d; // distorted
	return pr * (viewport[3] / 2);
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


Camera.prototype.getModelForScreenPixel = function(x,y,distance,face_to_eye, result)
{
	result = result || mat4.create();

	//convert coord from screen to world
	var pos = this.unproject([x,y,-1]);
	var delta = vec3.sub( vec3.create(), pos, this._position );
	vec3.normalize( delta, delta );
	vec3.scaleAndAdd( pos, pos, delta, distance );

	vec3.normalize( delta, delta );

	//build matrix
	mat4.fromTranslationFrontTop( result, pos, delta, this._up );

	return result;
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
	if(layers == null)
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
* propagate update method to all nodes
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
	layers = layers == null ? 0xFFFF : layers;
	RD.Scene._ray_tested_objects = 0;
	if(!result)
		result = ray.collision_point;
	if(test_against_mesh == null)
		test_against_mesh = true;
	return this.root.testRay( ray, result, max_dist, layers, test_against_mesh );

	//TODO
	//broad phase
		//get all the AABBs of all objects
		//store them in an octree
	/*
	var objects = this.gatherObjects( this.root, layers );
	for(var i = 0; i < objects.length; ++i)
	{
		var object = objects[i];
	}
	*/
}

/**
* test collision of this ray with nodes in the scene
* @method testSphere
* @param {vec3} center
* @param {float} radius 
* @param {number} layers bitmask to filter by layer, otherwise 0xFFFF is used
* @param {boolean} test_against_mesh test against every mesh
* @return {RD.SceneNode} node collided or null
*/
Scene.prototype.testSphere = function( center, radius, layers, test_against_mesh  )
{
	layers = layers == null ? 0xFFFF : layers;
	if(test_against_mesh == null)
		test_against_mesh = true;
	return this.root.testSphere( center, radius, layers, test_against_mesh );
}

//internal function fro broadphase
Scene.prototype.gatherObjects = function( node, layers, output )
{
	output = output || [];
	node.updateGlobalMatrix(true);

	if( node.mesh && layers & node.layers && !node.skeleton )
	{
		if( node.primitives && node.primitives.length )
		{
			for(var i = 0; i < node.primitives.length; ++i)
			{
				var prim = node.primitives[i];
				var material = this.overwrite_material || RD.Materials[ prim.material ];
				if(!material)
					continue;
				output.push([node,node._global_matrix,node.mesh,i,node.material]);
			}
		}	
	}
	else
		output.push([node,node._global_matrix,node.mesh,-1,node.material]);

	for(var i = 0; i < node.children.length; ++i)
		this.gatherObjects( node.children[i], layers, output );

	return output;
}

//it returns to which node of the array collided (even if it collided with a child)
//if get_collision_node is true, then it will return the exact node it collided
RD.testRayWithNodes = function testRayWithNodes( ray, nodes, coll, max_dist, layers, test_against_mesh, get_collision_node )
{
	RD.testRayWithNodes.coll_node = null; //hack to store a temp var
	max_dist = max_dist == null ? Number.MAX_VALUE : max_dist;
	layers = layers == null ? 0xFFFF : layers;
	RD.Scene._ray_tested_objects = 0;
	if(!coll)
		coll = ray.collision_point;

	if( !RD.testRayWithNodes.local_result )
		RD.testRayWithNodes.local_result = vec3.create();
	var local_result = RD.testRayWithNodes.local_result;

	//test against nodes
	var coll_node = null;
	for(var i = 0 ; i < nodes.length; ++ i )
	{
		var node = nodes[i];
		var child_collided = node.testRay( ray, local_result, max_dist, layers, test_against_mesh );
		if(!child_collided)
			continue;

		var distance = vec3.distance( ray.origin, local_result );
		if( distance > max_dist )
			continue;

		max_dist = distance; //adjust distance
		coll.set( local_result );
		RD.testRayWithNodes.coll_node = child_collided;
		if(!get_collision_node)
			coll_node = node; //child_collided;
		else
			coll_node = child_collided;
	}	

	return coll_node;
}

//internal function to reuse computations
RD.last_hit_test = null;

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

	RD.last_hit_test = hit_test;

	//compute global hit point
	result.set( hit_test.hit );
	vec3.transformMat4( result, result, model );
	distance = last_ray_distance = vec3.distance( ray.origin, result );

	//there was a collision but too far
	if( distance > max_dist )
		return false; 
	return true;
}

RD.testSphereMesh = function( local_center, local_radius, model, mesh, group_index, layers, test_against_mesh )
{
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

	//test against object oriented bounding box
	var r = geo.testSphereBBox( local_center, local_radius, bb );
	if(!r) //collided with OOBB
		return false;

	//vec3.transformMat4( result, temp_vec3, model );

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
	var hit_test = subgroup._octree.testSphere( local_center, local_radius );

	//collided the OOBB but not the mesh, so its a not
	if( !hit_test ) 
		return false;

	//vec3.transformMat4( result, result, model );
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
* This number is the 4� component of color but can be accessed directly 
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
	{
		var v = o[i];
		if(v)
		{
			if(v.constructor === Object) //avoid sharing objects between materials
				v = JSON.parse(JSON.stringify(v)); //clone
			else if(v.constructor === Array)
				v = v.concat();
			else if(v.constructor === Float32Array)
				v = new Float32Array(v);
		}
		this[i] = v;
	}
}

/**
* Stores this material in the global RD.Materials container
* @method register
* @param {String} name if no name is passed it will use this.name
*/
Material.prototype.register = function(name)
{
	if(name)
		this.name = name;
	if(!this.name)
		throw("cannot register material without name");
	RD.Materials[ this.name ] = this;
	return this; //to chain
}

Material.prototype.serialize = function()
{
	var o = {
		flags: JSON.parse( JSON.stringify(this.flags)),
		textures: JSON.parse( JSON.stringify(this.textures) ) //clone
	};

	o.color = typedArrayToArray( this._color );
	if(this.name)
		o.name = this.name;
	if(this.alphaMode)
		o.alphaMode = this.alphaMode;
	if(this.blendMode)
		o.blendMode = this.blendMode;
	if(this.alphaCutoff != 0.5)
		o.alphaCutoff = this.alphaCutoff;
	if(this.uv_transform)
		o.uv_transform = this.uv_transform;
	if(this.normalFactor)
		o.normalFactor = this.normalFactor;
	if(this.displacementFactor)
		o.displacementFactor = this.displacementFactor;
	if(this.backface_color)
		o.backface_color = typedArrayToArray( this.backface_color );
	if(this.emissive)
		o.emissive = typedArrayToArray( this.emissive );
	if(this.model)
	{
		o.model = this.model;
		o.metallicFactor = this.metallicFactor;
		o.roughnessFactor = this.roughnessFactor;
	}

	return o;
}

Material.prototype.render = function( renderer, model, mesh, indices_name, group_index, skeleton, node )
{
	//get shader
	var shader_name = this.shader_name;
	if(!shader_name)
	{
		var shader_name = "texture_albedo";
		if( this.model == "pbrMetallicRoughness" )
		{
			if(mesh.vertexBuffers.colors)
				shader_name += "_color";
			if(skeleton)
				shader_name += "_skeleton";
		}
		else
		{
			if( skeleton )
				shader_name = null;
			else
				shader_name = renderer.default_shader_name || RD.Material.default_shader_name;
		}
	}
	var shader = null;
	if (renderer.on_getShader)
		shader = renderer.on_getShader( node, renderer._camera );
	else
		shader = gl.shaders[ shader_name ];

	if (!shader) 
	{
		var color_texture = this.textures.color || this.textures.albedo;
		if( skeleton )
			shader = color_texture ? renderer._texture_skinning_shader : renderer._flat_skinning_shader;
		else
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

	//weird case of mesh without textures
	if( !texture)
	{
		if(shader.samplers.u_albedo_texture || shader.samplers.u_color_texture )
			gl.textures[ "white" ].bind(0);
	}

	//flags
	renderer.enableItemFlags( this );

	renderer._uniforms.u_model.set( model );
	if( skeleton && shader.uniformInfo.u_bones )
	{
		this.bones = skeleton.computeFinalBoneMatrices( this.bones, mesh );
		shader.setUniform("u_bones", this.bones );
	}
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
	this.disable_cull_face = false;
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

	if(!options.ignore_shaders)
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
* clears all resources from GPU
* @method destroy
*/
Renderer.prototype.destroy = function()
{
	gl.destroy()
	RD.Materials = {};
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
			if(!material)
				continue;
			if( this.onFilterByMaterial )
			{
				if( this.onFilterByMaterial( material, RD.Materials[ prim.material ] ) == false )
					continue;
			}
			this.renderMeshWithMaterial( node._global_matrix, mesh, material, "triangles", i, node.skeleton, node );
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
				this.renderMeshWithMaterial( node._global_matrix, mesh, material, node.indices, node.submesh, node.skeleton, node );
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
	{
		if( node.skeleton )
			shader = node.textures.color ? this._texture_skinning_shader : this._flat_skinning_shader;
		else
			shader = node.textures.color ? this._texture_shader : this._flat_shader;
	}

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

	if( node.skeleton )
	{
		node.bones = node.skeleton.computeFinalBoneMatrices( node.bones, mesh );
		shader.setUniform("u_bones", node.bones );
	}

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
			shader.drawInstanced( mesh, node.primitive == null ? gl.TRIANGLES : node.primitive, node.indices, instancing_uniforms, group.start, group.length );
		else if(node.draw_range)
			shader.drawInstanced( mesh, node.primitive == null ? gl.TRIANGLES : node.primitive, node.indices, instancing_uniforms, node.draw_range[0], node.draw_range[1] );
		else
			shader.drawInstanced( mesh, node.primitive == null ? gl.TRIANGLES : node.primitive, node.indices, instancing_uniforms );
	}
	else
	{
		if(group)
			shader.drawRange( mesh, node.primitive == null ? gl.TRIANGLES : node.primitive, group.start, group.length, node.indices );
		else if(node.draw_range)
			shader.drawRange( mesh, node.primitive == null ? gl.TRIANGLES : node.primitive, node.draw_range[0], node.draw_range[1] , node.indices );
		else
			shader.draw( mesh, node.primitive == null ? gl.TRIANGLES : node.primitive, node.indices );
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
	shader.draw( mesh, mode == null ? gl.TRIANGLES : mode, index_buffer_name );
	this.draw_calls += 1;
}

Renderer.prototype.renderMeshWithMaterial = function( model, mesh, material, index_buffer_name, group_index, skeleton, node )
{
	if(material.render)
		material.render( this, model, mesh, index_buffer_name, group_index, skeleton, node );
}

//allows to pass a mesh or a bounding box
//if matrix specified, the bbox will be TSR on rendering (rendered ad OOBB), not recomputed using the matrix
Renderer.prototype.renderBounding = function(mesh_or_bb, matrix, color)
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

	color = color || [1,1,0,1];

	var s = bb.subarray(3,6); //halfsize
	mat4.translate( m, matrix, bb.subarray(0,3) );
	mat4.scale( m, m, [s[0]*2,s[1]*2,s[2]*2] );
	this.renderMesh( m, gl.meshes["cube"], null, color, null, gl.LINES, "wireframe" );
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
	gl[ item.flags.two_sided === true || this.disable_cull_face ? "disable" : "enable"]( gl.CULL_FACE );
	
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
RD.Renderer.prototype.renderPoints = function( positions, extra, camera, num_points, shader, point_size, primitive, texture, model )
{
	if(!positions || positions.constructor !== Float32Array)
		throw("RD.renderPoints only accepts Float32Array");
	if(!shader)
	{
		if( primitive == GL.LINES || primitive == GL.LINE_LOOP )
		{
			shader = this.shaders["flat"];
		}
		else if( texture )
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
			shader = this.shaders[ extra ? "_points_color" : "_points"];
			if(!shader)
			{
				if(extra)
					shader = this.shaders["_points_color"] = new GL.Shader( RD.points_vs_shader, RD.points_fs_shader, { "COLORED":""} );
				else
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
	shader.setUniform( "u_model", model || RD.IDENTITY ); 
	shader.setUniform( "u_viewport", gl.viewport_data );
	shader.setUniform( "u_viewprojection", camera._viewprojection_matrix );
	if(texture)
		shader.setUniform( "u_texture", texture.bind(0) );
	shader.drawRange( mesh, primitive != null ? primitive : GL.POINTS, 0, num_points );

	return mesh;
}

RD.points_vs_shader = "\n\
precision highp float;\n\
attribute vec3 a_vertex;\n\
attribute vec4 a_extra4;\n\
varying vec3 v_pos;\n\
varying vec4 v_extra4;\n\
uniform mat4 u_model;\n\
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
	v_pos = (u_model * vec4(a_vertex,1.0)).xyz;\n\
	v_extra4 = a_extra4;\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
	gl_PointSize = computePointSize( u_pointSize, gl_Position.w );\n\
}\n\
";

RD.points_fs_shader = "\n\
precision highp float;\n\
uniform vec4 u_color;\n\
varying vec4 v_extra4;\n\
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
	#ifdef COLORED\n\
		color *= v_extra4;\n\
	#endif\n\
	#ifdef TEXTURED\n\
		color *= texture2D( u_texture, gl_FragCoord );\n\
	#endif\n\
	#ifdef FS_CODE\n\
		FS_CODE\n\
	#endif\n\
	gl_FragColor = color;\n\
}\n\
";

Renderer.prototype.renderLines = function( positions,  strip, model )
{
	this.renderPoints( positions, null, null, null, null, null, gl.LINES, null, model );
}

//for rendering lines with width...
	//stream vertices with pos in triangle strip form (aberrating jumps)
	//stream extra2 with info about line corner (to inflate)

Renderer.prototype.render3DLines = function( positions, lineWidth, strip, model )
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
	shader.drawRange( mesh, gl.TRIANGLES, 0, num_points * (strip ? 6 : 3 ));

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
* Returns the path appending the folder where assets are located
* @method getAssetFullPath
* @param {String} name name (and url) of the mesh
* @return {String} full path
*/
Renderer.prototype.getAssetFullPath = function( url, skip_assets_folder )
{
	if(url.indexOf("://") != -1 || skip_assets_folder)
		return url;

	if(!this.assets_folder)
		return url;
	else  if(this.onGetAssetsFolder)
		return this.onGetAssetFolder(url);
	else
	{
		var hasSlashA = this.assets_folder.substr(-1) == "/";
		var hasSlashB = url[0] == "/";
		if( hasSlashA != hasSlashB )
			return this.assets_folder + url;
		else if ( hasSlashA && hasSlashB )
			return this.assets_folder + url.substr(1);
		else 
			return this.assets_folder + "/" + url;
	}
	console.warn("this path should never be executed...");
	return url;
}

/**
* Loads one mesh and stores inside the meshes object to be reused in the future, if it is already loaded it skips the loading
* @method loadMesh
* @param {String} name name (and url) of the mesh
* @param {Function} on_complete callback
*/
Renderer.prototype.loadMesh = function( url, on_complete, skip_assets_folder )
{
	if(!url)
		return console.error("loadMesh: Cannot load null name");

	if( this.assets_loading[url] || this.assets_not_found[url] )
		return;

	var name = url;

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
	var full_url = this.getAssetFullPath( url, skip_assets_folder);

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
Renderer.prototype.loadTexture = function( url, options, on_complete, skip_assets_folder )
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
	var full_url = this.getAssetFullPath( url, skip_assets_folder);
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
Renderer.prototype.loadShaders = function( url, on_complete, extra_macros, skip_assets_folder )
{
	var that = this;
	
	if(url.indexOf("://") == -1 && !skip_assets_folder)
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

//reloads last shaders
Renderer.prototype.reloadShaders = function( extra_macros )
{
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

Renderer.prototype.renderDebugSceneTree = function( scene, camera )
{
	var points = [];
	for(var i = 0; i < scene._nodes.length; ++i)
	{
		var node = scene._nodes[i];
		if(!node._parent || node._parent == scene.root )
			continue;
		var parent_pos = node._parent.getGlobalPosition();
		var pos = node.getGlobalPosition();
		points.push( parent_pos[0],parent_pos[1],parent_pos[2],pos[0],pos[1],pos[2] );
	}
	points = new Float32Array(points);
	this.renderPoints( points, null, camera, null, null, null, GL.LINES );
	this.renderPoints( points, null, camera, null, null, -10, GL.POINTS );
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
	shader.uniforms( renderer._uniforms ).uniforms( this._uniforms ).drawRange( mesh, this.primitive == null ? GL.TRIANGLES : this.primitive, 0, range, this._total_indices ? "triangles" : null );
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
	if( gl._shaders_created )
	{
		this._flat_shader = gl.shaders["flat"];
		this._flat_instancing_shader = gl.shaders["flat_instancing"];
		this._flat_skinning_shader = gl.shaders["flat_skinning"];
		this._point_shader = gl.shaders["point"];	
		this._color_shader = gl.shaders["color"];
		this._texture_shader = gl.shaders["texture"];
		this._texture_albedo_shader = gl.shaders["texture_albedo"];
		this._texture_instancing_shader = gl.shaders["texture_instancing"];
		this._texture_albedo_instancing_shader = gl.shaders["texture_albedo_instancing"];

		if(RD.Skeleton)
			this._texture_skinning_shader = gl.shaders["texture_skinning"];

		this._texture_transform_shader = gl.shaders["texture_transform"];
		
		//basic phong shader
		this._phong_uniforms = { u_ambient: vec3.create(), u_light_vector: vec3.fromValues(0.5442, 0.6385, 0.544), u_light_color: RD.WHITE };
		this._phong_shader = gl.shaders["phong"];
		this._phong_shader._uniforms = this._phong_uniforms;
		this._phong_shader.uniforms( this._phong_uniforms );

		this._phong_instancing_shader = gl.shaders["phong_instancing"];
		this._phong_instancing_shader._uniforms = this._phong_uniforms;
		this._phong_instancing_shader.uniforms( this._phong_uniforms );

		this._textured_phong_shader = gl.shaders["textured_phong"];
		this._textured_phong_shader.uniforms( this._phong_uniforms );
		
		this._textured_phong_instancing_shader = gl.shaders["textured_phong_instancing"];
		this._textured_phong_instancing_shader.uniforms( this._phong_uniforms );
		this._normal_shader = gl.shaders["normal"];
		this._uvs_shader = gl.shaders["uvs"];
	}

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
				#ifdef COLOR\n\
				attribute vec4 a_color;\n\
				varying vec4 v_color;\n\
				#endif\n\
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
					#ifdef COLOR\n\
					v_color = a_color;\n\
					#endif\n\
					gl_Position = u_viewprojection * vec4( v_pos, 1.0 );\n\
					gl_PointSize = 2.0;\n\
				}\
				";
		
	var fragment_shader = this._flat_fragment_shader = "\
				precision highp float;\
				uniform vec4 u_color;\n\
				#ifdef COLOR\n\
				varying vec4 v_color;\n\
				#endif\n\
				void main() {\n\
					vec4 color = u_color;\n\
					#ifdef COLOR\n\
					color *= a_color;\n\
					#endif\n\
				  gl_FragColor = color;\n\
				}\
	";

	gl.shaders["flat"] = this._flat_shader = new GL.Shader( vertex_shader, fragment_shader );
	gl.shaders["flat_color"] = this._flat_instancing_shader = new GL.Shader(vertex_shader, fragment_shader, { COLOR:"" });
	gl.shaders["flat_instancing"] = this._flat_instancing_shader = new GL.Shader(vertex_shader, fragment_shader, { INSTANCING:"" });
	gl.shaders["flat_color_instancing"] = this._flat_instancing_shader = new GL.Shader(vertex_shader, fragment_shader, { INSTANCING:"",COLOR:"" });
	gl.shaders["flat_skinning"] = this._flat_skinning_shader = new GL.Shader( vertex_shader, fragment_shader, {SKINNING:""} );
	gl.shaders["flat_color_skinning"] = this._flat_skinning_shader = new GL.Shader( vertex_shader, fragment_shader, {SKINNING:"",COLOR:""} );
	
	this._point_shader = new GL.Shader("\
				precision highp float;\
				attribute vec3 a_vertex;\
				uniform mat4 u_mvp;\
				uniform float u_pointSize;\
				void main() {\
					gl_PointSize = u_pointSize;\
					gl_Position = u_mvp * vec4(a_vertex,1.0);\
				}\
				", "\
				precision highp float;\
				uniform vec4 u_color;\
				void main() {\
				  if( distance( gl_PointCoord, vec2(0.5)) > 0.5)\
				     discard;\
				  gl_FragColor = u_color;\
				}\
			");
	gl.shaders["point"] = this._point_shader;	
	
	this._color_shader = new GL.Shader("\
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
		", "\
		precision highp float;\
		varying vec4 v_color;\
		void main() {\
		  gl_FragColor = v_color;\
		}\
	");
	gl.shaders["color"] = this._color_shader;

	var fragment_shader = "\
		precision highp float;\
		varying vec2 v_coord;\
		uniform vec4 u_color;\n\
		#ifdef COLOR\n\
		varying vec4 v_color;\n\
		#endif\n\
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
			#ifdef COLOR\n\
				color *= v_color;\n\
			#endif\n\
			if(color.w <= u_global_alpha_clip)\n\
				discard;\n\
			gl_FragColor = color;\
		}\
	";
	
	gl.shaders["texture"] = this._texture_shader = new GL.Shader( vertex_shader, fragment_shader );
	gl.shaders["texture_albedo"] = this._texture_albedo_shader = new GL.Shader( vertex_shader, fragment_shader, { ALBEDO:"" } );
	gl.shaders["texture_albedo_color"] = this._texture_albedo_color_shader = new GL.Shader( vertex_shader, fragment_shader, { ALBEDO:"",COLOR:"" } );
	gl.shaders["texture_albedo_skinning"] = this._texture_albedo_skinning_shader = new GL.Shader( vertex_shader, fragment_shader, { SKINNING:"", ALBEDO:"" } );
	gl.shaders["texture_albedo_color_skinning"] = this._texture_albedo_color_skinning_shader = new GL.Shader( vertex_shader, fragment_shader, { SKINNING:"", ALBEDO:"", COLOR:"" } );
	gl.shaders["texture_instancing"] = this._texture_instancing_shader = new GL.Shader( vertex_shader, fragment_shader, { INSTANCING:"" } );
	gl.shaders["texture_albedo_instancing"] = this._texture_albedo_instancing_shader = new GL.Shader( vertex_shader, fragment_shader, { ALBEDO:"",INSTANCING:""  } );
	gl.shaders["texture_albedo_color_instancing"] = this._texture_albedo_instancing_shader = new GL.Shader( vertex_shader, fragment_shader, { ALBEDO:"",INSTANCING:"",COLOR:""} );

	if(RD.Skeleton)
		gl.shaders["texture_skinning"] = this._texture_skinning_shader = new GL.Shader( vertex_shader, fragment_shader, { SKINNING:"" } );

	this._texture_transform_shader = new GL.Shader("\
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
		", "\n\
		precision highp float;\n\
		varying vec2 v_coord;\n\
		uniform vec4 u_color;\n\
		uniform float u_global_alpha_clip;\n\
		uniform sampler2D u_color_texture;\n\
		void main() {\n\
			vec4 color = u_color * texture2D(u_color_texture, v_coord);\n\
			if(color.w <= u_global_alpha_clip)\n\
				discard;\n\
			gl_FragColor = color;\n\
		}\
	");
	gl.shaders["texture_transform"] = this._texture_transform_shader;
	
	//basic phong shader
	this._phong_uniforms = { u_ambient: vec3.create(), u_light_vector: vec3.fromValues(0.5442, 0.6385, 0.544), u_light_color: RD.WHITE };

	var fragment_shader = this._fragment_shader = "\
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
	";
	
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

	var fragment_shader = "\
			precision highp float;\n\
			varying vec3 v_normal;\n\
			void main() {\n\
				gl_FragColor = vec4( normalize(v_normal),1.0);\n\
			}\
	";
	gl.shaders["normal"] = this._normal_shader = new GL.Shader( vertex_shader, fragment_shader );

	var fragment_shader = "\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				gl_FragColor = vec4(v_coord,0.0,1.0);\n\
			}\
	";
	gl.shaders["uvs"] = this._uvs_shader = new GL.Shader( vertex_shader, fragment_shader );

	gl._shaders_created = true;
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

RD.alignDivToNode = function( domElement, cameraElement, div, node, camera, allow_cursor )
{
	var width = parseInt( domElement.clientWidth );
	var height = parseInt( domElement.clientHeight );
	var _widthHalf = width*0.5;
	var _heightHalf = height*0.5;
	var fov = camera._projection_matrix[ 5 ] * _heightHalf;

	//top container
	domElement.style.width = gl.canvas.width + "px";
	domElement.style.height = gl.canvas.height + "px";
	domElement.style.perspective = fov + 'px';
	domElement.style.pointerEvents = 'none';

	if(cameraElement)
	{
		var cameraCSSMatrix = 'translateZ(' + fov + 'px) ' + getCameraCSSMatrix( camera._view_matrix );
		var style = cameraCSSMatrix + ' translate(' + _widthHalf + 'px,' + _heightHalf + 'px)';
		cameraElement.style.transformStyle = 'preserve-3d';
		cameraElement.style.transform = style;
		cameraElement.style.width = width + "px";
		cameraElement.style.height = height + "px";
		cameraElement.style.pointerEvents = 'none';
	}

	var model = node.getGlobalMatrix();
	var scaleX = 1/div.clientWidth;
	var scaleY = 1/div.clientHeight;
	if( div.parentNode != cameraElement )
		cameraElement.appendChild( div );

	div.style.pointerEvents = allow_cursor ? 'auto' : 'none';
	div.style.transform = getObjectCSSMatrix( model ) + ' scale3D('+scaleX+','+scaleY+',1)';

	//renderObject( scene, scene, camera, cameraCSSMatrix );
	function epsilon(a) { return Math.abs(a) < 0.00001 ? 0 : a; }

	function getCameraCSSMatrix( matrix ) {
		return 'matrix3d(' + epsilon( matrix[ 0 ] ) + ',' 
			+ epsilon( - matrix[ 1 ] ) + ',' 
			+ epsilon( matrix[ 2 ] ) + ','
			+ epsilon( matrix[ 3 ] ) + ','
			+ epsilon( matrix[ 4 ] ) + ','
			+ epsilon( - matrix[ 5 ] ) + ','
			+ epsilon( matrix[ 6 ] ) + ',' 
			+ epsilon( matrix[ 7 ] ) + ','
			+ epsilon( matrix[ 8 ] ) + ','
			+ epsilon( - matrix[ 9 ] ) + ','
			+ epsilon( matrix[ 10 ] ) + ','
			+ epsilon( matrix[ 11 ] ) + ','
			+ epsilon( matrix[ 12 ] ) + ','
			+ epsilon( - matrix[ 13 ] ) + ','
			+ epsilon( matrix[ 14 ] ) + ','
			+ epsilon( matrix[ 15 ] ) + ')';
	}

	function getObjectCSSMatrix( matrix ) {

		var matrix3d = 'matrix3d(' + epsilon( matrix[ 0 ] ) + ','
			+ epsilon( matrix[ 1 ] ) + ','
			+ epsilon( matrix[ 2 ] ) + ','
			+ epsilon( matrix[ 3 ] ) + ','
			+ epsilon( - matrix[ 4 ] ) + ','
			+ epsilon( - matrix[ 5 ] ) + ','
			+ epsilon( - matrix[ 6 ] ) + ','
			+ epsilon( - matrix[ 7 ] ) + ','
			+ epsilon( matrix[ 8 ] ) + ','
			+ epsilon( matrix[ 9 ] ) + ','
			+ epsilon( matrix[ 10 ] ) + ','
			+ epsilon( matrix[ 11 ] ) + ','
			+ epsilon( matrix[ 12 ] ) + ','
			+ epsilon( matrix[ 13 ] ) + ','
			+ epsilon( matrix[ 14 ] ) + ','
			+ epsilon( matrix[ 15 ] ) + ')';
		return 'translate(-50%,-50%) ' + matrix3d;
	}
}

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
