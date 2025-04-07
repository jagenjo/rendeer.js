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

var SHADER_MACROS = {
	COLOR:		1,
	COORD1:		1<<1,
	INSTANCING: 1<<2,
	SKINNING:	1<<3,
	POINTS:		1<<4,
	NO_TRIANGLES:1<<5,

	TEXTURE:	1<<6,
	ALBEDO:		1<<7,
	EMISSIVE:	1<<8,
	OCCLUSION:	1<<9,
	ALPHA_HASH:	1<<10,
	UV_TRANSFORM:1<<11,
	LIGHTS: 	1<<12,
	SHADOWS: 	1<<13,
	FOG:		1<<143,
	FLAT_NORMAL:1<<15,
	UNLIT:		1<<16,

	SECOND_BUFFER:1<<17,
	FLAT_COLOR:	1<<18,

	MORPHTARGETS:1<<19,
};

var temp_vec3 = vec3.create();
var temp_vec3b = vec3.create();


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
var identity_mat3 = mat3.create();
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
*/
class SceneNode {

	_uid = last_object_id++;
	_id = null;

	//transform info
	_transform = new Float32Array(10);
	_position = this._transform.subarray(0,3);
	_rotation = this._transform.subarray(3,7);
	_scale = this._transform.subarray(7,10);
	
	_local_matrix = mat4.create();
	_global_matrix = mat4.create(); //in global space
	_must_update_matrix = false;

	//bounding box in world space
	bounding_box = null; //use updateBoundingBox to update it

	layers = 0x3|0; //first two layers

	mesh = null;

	instances = null; //array of mat4 with the model for every instance
	draw_range = null
	submesh = -1; //used if not primitives used

	//in case this object has multimaterial this will contain { index: submesh index, material: material name, mode: render primitive };
	primitives = []; 
	
	//in case it uses materials
	material = null;

	flags = {
		visible: true,
		collides: true //for testRay
	};

	extras = {}; //custom data

	//object inside this object
	_parent = null;
	children = [];


	/**
	* A unique identifier, useful to retrieve nodes by name
	* @property id {string}
	*/
	set id(v) {
		if(this._scene)
			console.error("Cannot change id of a node already in a scene.");
		else
			this._id = v;
	}
	get id() { return this._id; }

	/**
	* The position relative to its parent in vec3 format
	* @property position {vec3}
	*/
	get position() { return this._position; }
	set position(v) { this._position.set(v); this._must_update_matrix = true; }

	/**
	* The x position component relative to its parent
	* @property x {number}
	*/
	get x() { return this._position[0]; }
	set x(v) { this._position[0] = v; this._must_update_matrix = true; }

	/**
	* The y position component relative to its parent
	* @property y {number}
	*/
	get y() { return this._position[1]; }
	set y(v) { this._position[1] = v; this._must_update_matrix = true; }

	/**
	* The z position component relative to its parent
	* @property z {number}
	*/
	get z() { return this._position[2]; }
	set z(v) { this._position[2] = v; this._must_update_matrix = true; }


	/**
	* The orientation relative to its parent in quaternion format
	* @property rotation {quat}
	*/
	get rotation() { return this._rotation; }
	set rotation(v) { this._rotation.set(v); this._must_update_matrix = true; }

	/**
	* The scaling relative to its parent in vec3 format (default is [1,1,1])
	* @property scaling {vec3}
	*/
	get scaling() { return this._scale; }
	set scaling(v) { 
		if(v.constructor === Number)
			this._scale[0] = this._scale[1] = this._scale[2] = v;
		else
			this._scale.set(v);
		this._must_update_matrix = true; 
	}

	/**
	* An array containing [x,y,z, rotx,roty,rotz,rotw,  sx, sy, sz]
	* @property transform {vec3}
	*/
	get transform() { return this._transform; }
	set transform(v) { 
		this._transform.set(v);
		quat.normalize(this._rotation, this._rotation ); //ensure it is not deformed
		this._must_update_matrix = true; 
	}

	get matrix() { return this._local_matrix; }
	set matrix(v) { this.fromMatrix( v ); }

	get pivot() { return this._pivot; }
	set pivot(v) { 
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
	}

	set color(v) {
		if(this.material)
		{
			var mat = this.getMaterial();
			if(mat)
				mat.color = v;
		}
		else
			console.warn("cannot set color of node without material");
	}
	get color() {
		var mat = this.getMaterial();
		if(mat)
			mat.color;
		console.warn("cannot get color of node without material");
		return null;
	}
	
	//to work with tween
	get mustUpdate() { return this._must_update_matrix; }
	set mustUpdate(v) { 
		if(v)
			this._must_update_matrix = true; 	
	}
		
	get visible() { return this.flags.visible; }
	set visible(v) { this.flags.visible = v; }
	
	/**
	* In which scene is stored
	* @property scene {Scene}
	*/
	get scene() { return this._scene; }
	set scene(v) { throw("cannot set scene, you must use addChild in its parent node"); }
	
	/**
	* The parent node where this node is attached
	* @property parentNode {SceneNode}
	*/
	get parentNode() { return this._parent; }
	set parentNode(v) { throw("Cannot set parentNode of SceneNode, use addChild on parent"); }

	constructor(o) {
		quat.identity( this._rotation );
		this._scale.set( RD.ONE );
		if(o)
			this.fromJSON( o );
	}

	clone(depth)
	{
		var o = new this.constructor();
		for(var i in this)
		{
			if(i[0] == "_") //private
				continue;
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
		o.position = this.position;
		o.rotation = this.rotation;
		o.scaling = this.scaling;
		return o;
	}

	/**
	* Returns an object that represents the current state of this object an its children
	* @method toJSON
	* @return {Object} object
	*/
	toJSON()
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
		if(this.extras)
			r.extras = this.extras;
		if(this.animation)
			r.animation = this.animation;
		if(this.animations) //clone anims
		{
			r.animations = [];
			for(var i = 0; i < this.animations.length; ++i)
				r.animations.push( this.animations[i].toJSON() );
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
			r.skeleton = this.skeleton.toJSON();

		if(this.onSerialize)
			this.onSerialize(r);

		if(this.children)
		for(var i = 0, l = this.children.length; i < l; i++)
		{
			var node = this.children[i];
			r.children.push( node.toJSON() );
		}

		return r;
	}

	/**
	* Configure this SceneNode to a state from an object (used with serialize)
	* @method fromJSON
	* @param {Object} o object with the state of a SceneNode
	*/
	fromJSON(o)
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
					skeleton.fromJSON(o[i]);
					this.skeleton = skeleton;
					continue;
				case "animations":
					this.animations = [];
					for(var j = 0; j < o.animations.length; ++j)
					{
						var anim = new RD.Animation();
						anim.fromJSON( o.animations[j] );
						this.animations.push( anim );
					}
					continue;
				case "primitives":
					this.primitives = o.primitives.map(function(a){ return Object.assign({}, a); }); //clone first level
					continue;
				case "material":
					if( o[i] && o[i].constructor === Object )
					{
						var mat = new Material(o[i]);
						this.material = mat.register().name;
					}
					else
						this.material = o[i];
					continue;
					break;
				case "name":
				case "mesh":
				case "ref":
				case "draw_range":
				case "submesh":
				case "skin":
				case "extra":
				case "extras":
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
				child.fromJSON( o.children[i] );
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
	setMesh( mesh_name )
	{
		if(!mesh_name)
			this.mesh = null;
		else if( typeof(mesh_name) == "string" )
			this.mesh = mesh_name;
		else
			this._mesh = mesh_name;
	}	

	// Ierarchy stuff **********************************************************

	/**
	* Attach node to its children list
	* @method addChild
	* @param {RD.SceneNode} node
	* @param {Bool} keep_transform if true the node position/rotation/scale will be modified to match the current global matrix (so it will stay at the same place)
	*/
	addChild( node, keep_transform )
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
	removeChild( node, keep_transform )
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

	removeAllChildren()
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
	clear()
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
	remove()
	{
		if(!this._parent)
			return;
		this._parent.removeChild( this );
	}

	/**
	* calls to be removed from the scene
	* @method destroy
	* @param { Boolean } force [optional] force to destroy the resource now instead of deferring it till the update ends
	*/
	destroy( force )
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
	* Change the order inside the children, useful when rendering without Depth Test
	* @method setChildIndex
	* @param {RD.SceneNode} child
	* @param {Number} index
	*/
	setChildIndex(child, index)
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
	getAllChildren(r)
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
	getVisibleChildren( result, layers, layers_affect_children )
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
			node.updateGlobalMatrix(true);
			node.getVisibleChildren(result, layers);
		}

		return result;
	}	

	/**
	* Searchs the node and returns the first child node with the matching id, it is a recursive search so it is slow
	* @method findNode
	* @param {string} id the id of the node
	* @return {SceneNode} result node otherwise null
	*/
	findNode(id)
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
	findNodeByName(name)
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
	findNodesByFilter( filter_func, layers, result )
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
	propagate(method, params)
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

	// Transform stuff ****************************************************
	/**
	* clears position, rotation and scale
	* @method resetTransform
	*/
	resetTransform()
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
	translate( delta, local )
	{
		if(local)
			this.getGlobalVector( delta, temp_vec3 );
		else
			temp_vec3.set(delta);
		vec3.add( this._position, this._position, temp_vec3 );
		this._must_update_matrix = true;
	}

	moveLocal( delta )
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
	setEulerRotation(yaw,pitch,roll)
	{
		if(yaw && yaw.length >= 3)
			quat.fromEuler( this._rotation, yaw);
		else
			quat.fromEuler( this._rotation, [yaw,pitch,roll]);
		this._must_update_matrix = true;
	}

	/**
	* returns a vec3 decomposition of .rotation in euler format [yaw,pitch,roll]
	* @method rotate
	* @param {vec3} out [optional]  in radians
	*/
	getEulerRotation(out)
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
	rotate( angle_in_rad, axis, in_local )
	{
		if(in_local)
			axis = this.getGlobalVector(axis, temp_vec3);

		quat.setAxisAngle( temp_quat, axis, angle_in_rad );
		
		//quat.multiply( this._rotation, this._rotation, temp_quat );
		quat.multiply( this._rotation, temp_quat, this._rotation );
		this._must_update_matrix = true;
	}

	/**
	* Rotate object passing a quaternion containing a rotation
	* @method rotateQuat
	* @param {quat} q
	*/
	rotateQuat(q, in_local)
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
	scale(v)
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
	lookAt( position, target, up, reverse )
	{
		this.position = position;
		this.orientTo( target, reverse, up );
	}

	/**
	* Rotate object to face in one direction
	* @method orientTo
	* @param {vec3} v
	* @param {boolean} reverse to reverse the z orientation
	* @param {vec3} up the up vector to use
	* @param {boolean} in_local_space of the V value is a local vector, otherwise it is assumed a world coordinate
	* @param {boolean} cylindrical to billboard only cylindrically, not spherically (keeping the vertical axis)
	*/
	orientTo( v, reverse, up, in_local_space, cylindrical, invert )
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
		if(invert)
			quat.invert(this._rotation,this._rotation);
		quat.normalize(this._rotation, this._rotation );
		this._must_update_matrix = true;
		return this;
	}

	/**
	* Set the pivot point, 0,0,0 by default (WARNING: use flags.pivot = true  to enable the use of the pivot)
	* @method setPivot
	* @param {vec3} pivot local coordinate of the pivot point
	*/
	setPivot(pivot)
	{
		this.pivot = pivot;
	}

	/**
	* Get transform local matrix
	* @method getLocalMatrix
	* @param {mat4} out [optional] where to copy the result, otherwise it is returned the property matrix
	* @return {mat4} matrix44 
	*/
	getLocalMatrix(out)
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
	getGlobalMatrix(out, fast)
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
	getGlobalRotation(result)
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
	updateLocalMatrix()
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
	updateGlobalMatrix(fast, update_childs)
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
	updateMatrices(fast)
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
	fromMatrix(m, is_global)
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
	getLocalPoint(v, result)
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
	getParentVector(v, result)
	{
		result = result || vec3.create();
		return vec3.transformQuat( result, v, this._rotation );
	}

	//LEGACY
	getLocalVector(v)
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
	getGlobalPosition(result, fast)
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
	localToGlobal(v, result, fast)
	{
		result = result || vec3.create();
		var m = this.getGlobalMatrix( null, fast );
		return vec3.transformMat4(result, v, m );	
	}


	/**
	* Transform a point from global coordinates to local coordinates
	* @method globalToLocal
	* @param {vec3} v the point
	* @param {vec3} [result=vec3] where to store the output
	* @return {vec3} result
	*/
	globalToLocal(v,result)
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
	globalVectorToLocal(v,result)
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
	getGlobalVector(v, result)
	{
		result = result || vec3.create();
		var q = this.getGlobalRotation(temp_quat);
		return vec3.transformQuat( result, v, q );
	}

	/**
	* Returns the rotation in global coordinates
	* @method getGlobalRotation
	* @param {quat} [result=optional] where to store the output
	* @return {quat} result
	*/
	getGlobalRotation(result)
	{
		result = result || quat.create();
		if(!this._parent || !this._parent._transform)
		{
			result.set( this._rotation );
			return result;
		}
		this._parent.getGlobalRotation(result);
		quat.multiply( result, result, this._rotation );
		return result;
	}	

	/**
	* Returns the distance between the center of the node and the position in global coordinates
	* @method getDistanceTo
	* @param {vec3} position the point
	* @return {number} result
	*/
	getDistanceTo(position)
	{
		var m = this.getGlobalMatrix();
		return vec3.distance(position, m.subarray(12,15));
	}

	// *** OTHER *************

	/**
	* Updates the bounding box in this node, taking into account the mesh bounding box and its children
	* @method updateBoundingBox
	* @param { Boolean } force [optional] force to destroy the resource now instead of deferring it till the update ends
	*/
	updateBoundingBox( ignore_children )
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
	* @method createMaterial
	* @param { Object } material info
	* @return { RD.Material } the material 
	*/
	createMaterial(mat)
	{
		var material = new RD.Material(mat);
		this.material = material.register().name;
		return material;
	}

	/**
	* @method replaceMaterial
	* @param { string } old_mat old material name
	* @param { string } material new material name
	* @return { RD.Material } the material 
	*/
	replaceMaterial(old_mat, mat)
	{
		for(let i = 0; i < this.primitives.length; ++i)
		{
			var p = this.primitives[i];
			if(p.material === old_mat)
				p.material = mat;
		}
		if(this.material === old_mat)
			this.material = mat;
	}

	/**
	* returns the N material
	* @method getMaterial
	* @param { Number } index
	* @return { RD.Material } the material or null if not found
	*/
	getMaterial(index)
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
	setLayerBit( bit_num, value )
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
	isInLayerBit( bit_num )
	{
		return (this.layers & (1<<bit_num)) !== 0;
	}	

	/**
	* adjust the rendering range so it renders one specific submesh of the mesh
	* @method setRangeFromSubmesh
	* @param {String} submesh_id could be the index or the string with the name
	*/
	setRangeFromSubmesh( submesh_id )
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
	findNodesInSphere( center, radius, layers, out )
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

}

RD.SceneNode = SceneNode;

// info about properties
SceneNode["@position"] = { type: "vec3" };
SceneNode["@scaling"] = { type: "vec3" };
SceneNode["@rotation"] = { type: "quat" }; //for tween


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

		if( (this.layers & layers) && this.flags.collides !== false )
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

		//Warning: if you use this._global_matrix and the object wasnt visible, it wont have the matrix updated
		var model = this.getGlobalMatrix(gmatrix,true); 

		//test world ray against bounding sphere only if constant scale
		var bb = mesh.getBoundingBox();
		var axisX = Math.abs(model[0] + model[1] + model[2]);
		var axisY = Math.abs(model[4] + model[5] + model[6]);
		var axisZ = Math.abs(model[8] + model[9] + model[10]);
		var radius = vec3.length(bb.subarray(3,6)) * Math.sqrt(axisX);
		if( Math.abs(axisX - axisY) < 0.001 && Math.abs(axisX - axisZ) < 0.001 && !geo.testRaySphere(ray.origin, ray.direction, vec3.transformMat4( origin, bb.subarray(0,3), model ), radius,undefined,max_dist))
			return false;

		//ray to local
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

		if( (this.layers & layers) && this.flags.collides !== false )
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
* finds the nearest point to this node mesh
* @method findNearestPointToMesh
* @param { vec3 } point the reference point
* @param { Number } maxDist the max distance
* @param { vec3 } out to store the nearest point
* @param { vec3 } out_normal to store the nearest point normal
* @param { boolean } skip_transform to assume is in local space
* @return { number } the distance to the nearest point
*/
SceneNode.prototype.findNearestPointToMesh = (function(){ 
	var gmatrix = mat4.create();
	var inv = mat4.create();
	var local_point = vec3.create();

	return function( point, maxDist, out, out_normal, skip_transform )
	{
		if( !this.mesh )
			return false;

		var mesh = gl.meshes[ this.mesh ];
		if( !mesh || mesh.ready === false) //mesh not loaded
			return Infinity;

		//Warning: if you use this._global_matrix and the object wasnt visible, it wont have the matrix updated
		if( skip_transform )
			vec3.copy( local_point, point );
		else
		{
			this.getGlobalMatrix(gmatrix); 
			mat4.invert( inv, gmatrix );
			vec3.transformMat4( local_point, point, inv );
		}

		if(!mesh.octree)
			mesh.octree = new GL.Octree(mesh);
		var dist = mesh.octree.findNearestPoint(local_point,out, maxDist, out_normal);
		if(dist === maxDist)
			return dist;
		//convert out from local to global
		if( !skip_transform )
			vec3.transformMat4( out, out, gmatrix );
		return dist;//we are not scaling the distance...
	}
})();	

/**
* finds the nearest point to this node mesh and its children meshes
* @method findNearestPointToNode
* @param { vec3 } point the reference point
* @param { Number } maxDist the max distance
* @param { vec3 } out to store the nearest point
* @param { vec3 } out_normal to store the nearest point normal
* @return { {node,distance} } the node and the distance to the nearest point
*/
SceneNode.prototype.findNearestPointToNode = function( point, maxDist, out, out_normal )
{
	var result = null;
	var dist = maxDist;
	if(this.mesh && this.flags.collides)
	{
		dist = this.findNearestPointToMesh(point, maxDist, out, out_normal);
		if(dist < maxDist)
			result = { node: this, distance: dist };
	}

	for(let i = 0; i < this.children.length; ++i)
	{
		var child = this.children[i];
		if(child.flags.collides)
		{
			var res = this.findNearestPointToNode(point, dist, out, out_normal);
			if(res.distance < dist)
				result = res;
		}
	}
	return result;
}

RD.findNearestPointToNodes = function( point, nodes, maxDist, out, out_normal )
{
	var result = null;
	var dist = maxDist;

	var temp = vec3.create();
	var temp2 = vec3.create();
	out = out || vec3.create();
	out_normal = out_normal || vec3.create();
	for(let i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		if(!node.mesh)
			continue;
		var dist = node.findNearestPointToMesh(point, dist, temp, temp2);
		if(!result || dist < result.distance)
		{
			vec3.copy(out, temp);
			vec3.copy(out_normal, temp2);
			if(!result)
				result = { node, distance: dist, position: out, normal: out_normal };
			result.node = node;
			result.distance = dist;
		}
	}
			
	return result;
}


/**
* Camera wraps all the info about the camera (properties and view and projection matrices)
* @class Camera
* @constructor
*/
class Camera {

	static PERSPECTIVE = 1;
	static ORTHOGRAPHIC = 2;

	constructor( options )
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
		this._inv_viewprojection_matrix = mat4.create();
		this._model_matrix = mat4.create(); //inverse of view
		
		this._autoupdate_matrices = true;
		this._must_update_matrix = false;

		this._top = vec3.create();
		this._right = vec3.create();
		this._front = vec3.create();

		this._uniforms = {
			u_view_matrix: this._view_matrix,
			u_projection_matrix: this._projection_matrix,
			u_viewprojection: this._viewprojection_matrix,
			u_camera_front: this._front,
			u_camera_position: this._position,
			u_camera_planes: vec2.fromValues(0.1,1000),
		};

		if(options)
			this.fromJSON( options );

		this.updateMatrices();
	}
}

RD.Camera = Camera;

Camera.prototype.fromJSON = function(o)
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

Camera.prototype.toJSON = function()
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
		this._near = this._uniforms.u_camera_planes[0] = v; 
		this._must_update_matrix = true;
	},
	enumerable: false //avoid problems
});

Object.defineProperty(Camera.prototype, 'far', {
	get: function() { return this._far; },
	set: function(v) { 
		this._far = this._uniforms.u_camera_planes[1] = v;
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
* set camera point of view and
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

	mat4.invert( this._inv_viewprojection_matrix, this._viewprojection_matrix);
	
	this._must_update_matrix = false;

	mat4.rotateVec3( this._right, this._model_matrix, RD.RIGHT );
	mat4.rotateVec3( this._top,   this._model_matrix, RD.UP );
	mat4.rotateVec3( this._front, this._model_matrix, RD.FRONT );

	this.distance = vec3.distance(this._position, this._target);

	this._uniforms.u_camera_planes[0] = this._near;
	this._uniforms.u_camera_planes[1] = this._far;
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
		const deltax = event.deltax || event.movementX;
		const deltay = event.deltay || event.movementY;

		if(deltax)
			this.rotate( deltax * -0.005, RD.UP );
		if(deltay)
			this.rotateLocal( deltay * -0.005, RD.RIGHT );
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

//it rotates the matrix so it faces the camera
Camera.prototype.followNode = function( node, up )
{
	var eye = node.getGlobalPosition();
	var center = node.localToGlobal([0,0,-1]);
	this.lookAt(eye,center,up || [0,1,0]);
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
* test if a bounding box is inside frustrum (you must call camera.extractPlanes() previously to update frustrum planes)
* @method testBBox
* @param {BBox} aabb the bounding box in BBox format
* @return {number} CLIP_OUTSIDE or CLIP_INSIDE or CLIP_OVERLAP
*/
Camera.prototype.testBBox = function(aabb)
{
	return this.testBox(aabb,aabb.subarray(3,6));
}

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

/** Tells how big would it look into the screen, in proportion to viewport size */
Camera.prototype.projectedSphereSize = function(center, radius)
{
	var a = mat4.projectVec3( temp_vec3, this.viewprojection_matrix, center );
	var b = vec3.scaleAndAdd(temp_vec3b, center, this._right, radius);
	mat4.projectVec3( b, this.viewprojection_matrix, b );
	return vec2.distance(a,b);
}

Camera.prototype.computeAproximateScreenSize = function(bbox) {
	return this.projectedSphereSize(bbox, bbox[12]);
}


/**
* Scene holds the full scene graph, use root to access the root child
* @class Scene
* @constructor
*/
class Scene {
	constructor(){
		this._root = new RD.SceneNode();
		this._root.flags.no_transform = true; //avoid extra matrix multiplication
		this._root._scene = this;
		this._nodes_by_id = {};
		this._nodes = [];
		this._to_destroy = [];

		this.time = 0;
		this.frame = 0;
	}
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
* adds a node to the root
* @method add
*/
Scene.prototype.add = function(node)
{
	this.root.addChild(node);
}

/**
* removes a node from the root
* @method remove
*/
Scene.prototype.remove = function(node)
{
	this.root.removeChild(node);
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
* also destroys pending stuff
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
	this.root.fromJSON( json );
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
			//if(node.shader)
			//	data.shader = node.shader;
			//if(node.color[0] != 1 || node.color[1] != 1 || node.color[2] != 1 || node.color[3] != 1 )
			//	data.color = typedArrayToArray(node.color);
			//if(Object.values(node.textures).filter(function(a){return a;}) > 0)
			//	data.shader = node.shader;
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



// *** MATERIAL ***************************************************
var instancing_uniforms = {
	u_model: null
};

/**
* Material is a data container about the properties of an objects material
* @class Material
* @constructor
*/
class Material
{
	static last_material_id = 0;

	constructor(o)
	{
		this._color = vec4.fromValues(1,1,1,1);
		this._emissive = vec3.fromValues(0,0,0);
		this.shader_name = null;

		this.uniforms = {};
		this.textures = {};

		this.primitive = -1; //default
		this.blend_mode = RD.BLEND_NONE;

		this.flags = {
			two_sided: false,
			depth_test: true,
			depth_write: true
		};

		if(o)
			this.fromJSON(o);
	}

	set color(v){ this._color.set(v); }
	get color(){return this._color; }
	set albedo(v){ this._color.set(v); }
	get albedo(){return this._color; }
	set emissive(v){ this._emissive.set(v); }
	get emissive(){return this._emissive; }
	/**
	* This number is the 4th component of color but can be accessed directly 
	* @property opacity {number}
	*/
	set opacity(v) { this._color[3] = v; }
	get opacity() { return this._color[3]; }
	set two_sided(v) { this.flags.two_sided = v; }
	get two_sided() { return this.flags.two_sided; }

	/**
	* Stores this material in the global RD.Materials container
	* @method register
	* @param {String} name if no name is passed it will use this.name
	*/
	register(name)
	{
		if(!name)
			name = this.name || RD.makeHash(32);
		this.name = name;
		RD.Materials[ this.name ] = this;
		return this; //to chain
	}

	setUVTransform(offsetx, offsety, scalex, scaley, from_top)
	{
		if(!this.uv_transform)
			this.uv_transform = mat3.create();
		var m = mat3.identity( this.uv_transform );
		mat3.translate(m,m,[offsetx,from_top ? 1 - offsety : offsety]);
		mat3.scale(m,m,[scalex,scaley]);
	}

	fromJSON(o)
	{
		for(var i in o)
		{
			var v = o[i];
			if(v)
			{
				if(i === "name")
					this.register(v);
				else if(i === "material" && v )
				{
					if ( v.constructor === Object )
					{
						var m = new RD.Material(v);
						this.register();
						v = m.name;
					}
					else if ( v.constructor === RD.Material )
					{
						this.register();
						v = v.name;
					}
				}
				else if(i === 'texture')
				{
					this.textures['color'] = v;
					continue;
				}
				else if(v.constructor === Object) //avoid sharing objects between materials
					v = JSON.parse(JSON.stringify(v)); //clone
				else if(v.constructor === Array)
					v = v.concat();
				else if(v.constructor === Float32Array)
					v = new Float32Array(v);
			}
			this[i] = v;
		}
	}

	toJSON()
	{
		var o = {
			flags: JSON.parse( JSON.stringify(this.flags)),
			textures: JSON.parse( JSON.stringify(this.textures) ) //clone
		};

		o.color = Array.from( this._color );
		if(this.name)
			o.name = this.name;
		if(this.alphaMode)
			o.alphaMode = this.alphaMode;
		if(this.blendMode)
			o.blendMode = this.blendMode;
		if(this.alphaCutoff != 0.5)
			o.alphaCutoff = this.alphaCutoff;
		if(this.uv_transform)
			o.uv_transform = Array.from( this.uv_transform );
		if(this.normalFactor)
			o.normalFactor = this.normalFactor;
		if(this.displacementFactor)
			o.displacementFactor = this.displacementFactor;
		if(this.backface_color)
			o.backface_color = Array.from( this.backface_color );
		if(this.emissive)
			o.emissive = Array.from( this.emissive );
		if(this.model)
		{
			o.model = this.model;
			o.metallicFactor = this.metallicFactor;
			o.roughnessFactor = this.roughnessFactor;
		}

		return o;
	}
}



RD.Material = Material;


/** LIGHT ****************************** */

RD.SPOT_LIGHT = 1;
RD.POINT_LIGHT = 2;
RD.DIRECTIONAL_LIGHT = 3;

class Light extends RD.SceneNode
{
	static DEFAULT_SHADOWMAP_RESOLUTION = 2048;

	intensity = 1;
	area = 10; //frustum
	cast_shadows = false;
	max_distance = 10;
	light_type = RD.SPOT_LIGHT;
	cone_start = 30;
	cone_end = 45;

	_shadowmap_index = -1;

	_color = vec3.fromValues(0.9,0.9,0.9);
	_center = vec3.create();
	_front = vec3.create(); //light direction (from light to scene)

	constructor()
	{
		super();
	}

	set color(v){
		this._color.set(v);
	}
	get color() { return this._color; }

	followCamera(camera, viewsize) {
		var size = viewsize || 5;
		
		var offset = vec3.scaleAndAdd( vec3.create(), camera.target, this._vector, -viewsize );
		this.lookAt( offset, camera.target, camera.up );
		this.camera.orthographic(size,0.01,size*3,1);
		this.camera.updateMatrices();
	}

	insideCamera(camera) {
		if(this.light_type === RD.DIRECTIONAL_LIGHT)
			return true;
		var center = this.getGlobalPosition();
		return camera.testSphere(center, this.max_distance) !== CLIP_OUTSIDE;
	}

	overlaps(renderable){
		return this.light_type === RD.DIRECTIONAL_LIGHT ||
		renderable.skin ||
		geo.testSphereBBox(this._center,this.max_distance,renderable.bounding) !== RD.CLIP_OUTSIDE;
	}
}

RD.Light = Light;


class View {
	width = 0;
	height = 0;
	layers = 0xFF;
	textures = {};
	fbos = {};
}

RD.View = View;


/**
* Renderer in charge of rendering a Scene
* Valid options: all LiteGL context creation options (canvas, WebGL Flags, etc), plus: assets_folder, autoload_assets, shaders_file
* @class Renderer
* @constructor
*/
class Renderer {

	_color = vec4.fromValues(1,1,1,1);
	_ambient_light = vec3.fromValues(0.9,0.9,0.9);
	_light_color = vec3.fromValues(0.1,0.1,0.1);
	_light_vector = vec3.fromValues(0.5442, 0.6385, 0.544);

	_main_view = new View();

	set color(v){
		this._color.set(v);
	}
	get color(){
		return this._color;
	}

	set ambient_light(v){
		this._ambient_light.set(v);
	}
	get ambient_light(){
		return this._ambient_light;
	}

	set light_vector(v){
		this._light_vector.set(v);
	}
	get light_vector(){
		return this._light_vector;
	}

	set light_color(v){
		this._light_color.set(v);
	}
	get light_color(){
		return this._light_color;
	}

	set fog_color(v){
		this._fog_uniforms.u_fog_color.set([v[0],v[1],v[2]]);
	}

	get fog_color() { 
		return this._fog_uniforms.u_fog_color.subarray(0,3);
	}
	
	set fog_density(v){
		this._fog_uniforms.u_fog_color[3] = v;
	}
	get fog_density() {
		return this._fog_uniforms.u_fog_color[3];
	}

	constructor( context_or_canvas, options )
	{
		//setup context
		var context = null;
		if(!options && context_or_canvas.constructor === Object)
		{
			options = context_or_canvas;
			context_or_canvas = null;
		}
		options = options || {};

		if(!context_or_canvas)
		{
			context_or_canvas = document.createElement("canvas");
			context_or_canvas.width = options.width || document.body.offsetWidth;
			context_or_canvas.height = options.height || document.body.offsetHeight;
		}

		if( context_or_canvas.constructor === HTMLCanvasElement )
			context = GL.create({canvas: context_or_canvas, version: 2, alpha: options.alpha});
		else
			context = context_or_canvas;
		var gl = this.gl = this.context = context;
		if(!gl || !gl.enable)
			throw("litegl GL context not found.");
		if(context != global.gl)
			gl.makeCurrent();
		//GL.Shader.use_async = false; //set to false if you plan to code shaders, it helps debug in the console

		//init stuff
		this.assets_folder = "";
				
		this.use_alpha_hash = false;
		this.use_flat_normal = false;
		this.use_fog = false;
		this.small_objects_ratio_threshold = 0; //change this ignore objects with small projected size (0.01 is a good value)
		this.layers_affect_children = false;
		this.allow_instancing = true;
		this.force_update_bones = true; //set to false if you want to handle it manually
		this.point_size = 1;

		this.reverse_normals = false; //used for reflections or shadowmaps
		this.disable_cull_face = false;

		
		this._model_matrix = mat4.create();
		this._mvp_matrix = mat4.create();
		this._texture_matrix = mat3.create();

		this.renderables = []; //current
		this.renderables_pool = []; //total
		this.used_renderables = 0;
		this.rendered_renderables = 0;
		this.outline_renderables = [];

		this.morph_textures = new Map(); //to store morph targets rendered

		this.lights = [];
		
		this._nodes = [];
		this._uniforms = {
			u_model: this._model_matrix,
			u_global_alpha_clip: 0.0,
			u_point_size: this.point_size,
			u_res: new Float32Array([1,1,1,1])
		};

		this._lights_uniforms = {
			u_num_lights: 0,
			u_light_color: new Float32Array(4*4), //color and type
			u_light_position: new Float32Array(4*4), //pos and max dist
			u_light_front: new Float32Array(4*4), //front and ??
			u_light_params: new Float32Array(4*4), //cos cone start, cos cone end, shadow index
		};

		this._fog_uniforms = {
			u_fog_color: new Float32Array([0.5,0.5,0.5,1])
		};

		this.global_uniforms_containers = [ this._uniforms ];
		this.outline_color = [1,1,1,1];

		this._phong_uniforms = { u_ambient: this._ambient_light, u_sun_light_vector: this._light_vector, u_sun_light_color: this._light_color };
		
		//set some default stuff
		global.gl = this.gl;
		this.canvas = gl.canvas;

		this.assets_folder = options.assets_folder || "";
		this.autoload_assets = options.autoload_assets !== undefined ? options.autoload_assets : true;
		this.default_texture_settings = { wrap: gl.REPEAT, minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.LINEAR };
		this.default_cubemap_settings = { minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.LINEAR, is_cross: 1 };
		this.default_material = new RD.Material();
			
		//global containers and basic data
		this.meshes["plane"] = GL.Mesh.plane({size:1});
		this.meshes["planeXZ"] = GL.Mesh.plane({size:1,xz:true});
		this.meshes["cube"] = GL.Mesh.cube({size:1,wireframe:true});
		this.meshes["sphere"] = GL.Mesh.sphere({size:1, subdivisions: 32, wireframe:true});
		this.meshes["grid"] = GL.Mesh.grid({size:10});
		
		this.textures["notfound"] = this.default_texture = new GL.Texture(1,1,{ filter: gl.NEAREST, pixel_data: new Uint8Array([0,0,0,255]) });
		this.textures["white"] = this.default_texture = new GL.Texture(1,1,{ filter: gl.NEAREST, pixel_data: new Uint8Array([255,255,255,255]) });
		this.textures["bayer8x8"] = this._bayer_texture = new GL.Texture(8,8,{ format: GL.LUMINANCE, pixel_data: new Uint8Array([0, 48, 12, 60, 3, 51, 15, 63,
			32, 16, 44, 28, 35, 19, 47, 31,
			8,  56, 4,  52, 11, 59, 7,  55,
			40, 24, 36, 20, 43, 27, 39, 23,
			2,  50, 14, 62, 1,  49, 13, 61,
			34, 18, 46, 30, 33, 17, 45, 29,
			10, 58, 6,  54, 9,  57, 5,  53,
			42, 26, 38, 22, 41, 25, 37, 21])});
		this._bayer_texture.setParameter( GL.TEXTURE_MAG_FILTER, gl.NEAREST );
	
		this.num_assets_loading = 0;
		this.assets_loading = {};
		this.assets_not_found = {};
		this.frame = 0;
		this.stats = {
			draw_calls: 0,
			updated_shadowmaps: 0,
		};

		this.supports_instancing = gl.extensions.ANGLE_instanced_arrays || gl.webgl_version > 1;

		this.createShaders();
		this.pipelineShader = new RD.UberShader(Renderer.getMasterVertexShader, Renderer.getMasterFragmentShader);

		if(options.shaders_file)
			this.loadShaders( options.shaders_file, null, options.shaders_macros );
	}
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

	for(var i = 0; i < nodes.length; ++i)
		if(nodes[i].preRender)
			nodes[i].preRender();

	//prepass
	var renderables = this.getAllRenderables(nodes, layers, camera);
	var lights = this.lights; //getAllRenderables already gathers them

	//stack to store state
	this._state = [];
	this._meshes_missing = 0;
	this.resetStats();
	this._current_scene = scene;

	//set globals
	this._uniforms.u_time = scene.time;
	vec3.normalize(this._light_vector,this._light_vector);

	var that = this;
	pipeline = pipeline || this.pipeline;

	//frustum culling
	var visible_renderables = renderables.filter(rc=> (rc.flags & RENDERABLE_IGNORE_BOUNDING) || camera.testBBox( rc.bounding ) !== RD.CLIP_OUTSIDE);
	if(this.small_objects_ratio_threshold > 0)
		visible_renderables = visible_renderables.filter(rc=>(rc.flags & RENDERABLE_IGNORE_BOUNDING) || camera.computeAproximateScreenSize(rc.bounding) > this.small_objects_ratio_threshold );
	//first opaque, then semitransparent
	visible_renderables = visible_renderables.sort((a,b)=>a.material.blend_mode - b.material.blend_mode);

	//filter lights that are too small
	var visible_lights = this.lights.filter(l=>l.insideCamera(camera) && (!this.small_objects_ratio_threshold || camera.projectedSphereSize(l._center,l.max_distance) > this.small_objects_ratio_threshold));

	//update 
	this.updateShadowmaps( visible_lights, renderables, visible_renderables );

	//prepare camera stuff
	this.enableCamera( camera );
	this._uniforms.u_res[0] = gl.viewport_data[2];
	this._uniforms.u_res[1] = gl.viewport_data[3];
	this._uniforms.u_res[2] = 1 / gl.viewport_data[2];
	this._uniforms.u_res[3] = 1 / gl.viewport_data[3];
	this._uniforms.u_point_size = this.point_size;

	if( pipeline )
		pipeline.render( this, visible_renderables, visible_lights, camera, scene, skip_fbo );
	else
	{
		//group by instancing
		if( this.allow_instancing && this.supports_instancing )
			visible_renderables = this.groupRenderablesForInstancing(visible_renderables);
		
		//render skybox
		if(this.skybox_texture)
			this.renderSkybox(camera, this.skybox_texture);

		//rendering
		for (var i = 0; i < visible_renderables.length; ++i)
		{
			var rc = visible_renderables[i];
			rc.node.flags.was_rendered = true;
			this.renderRenderable( rc, visible_lights );
		}
	}

	//outline
	if(this.outline_renderables.length)
		this.renderOutline(this.outline_renderables,camera);

	if(this.morph_texture)
	{
		gl.disable( gl.DEPTH_TEST );
		gl.disable( gl.CULL_FACE );
		gl.disable( gl.BLEND );
		this.morph_texture.toViewport();
	}

	if(this.onPostRender)
		this.onPostRender( camera );
	
	scene.frame++;
	this.frame++;
	this._current_scene = null;
}

Renderer.prototype.renderRenderable = function( rc, lights )
{
	if(rc.material.render)
		return rc.material.render(this, rc, lights);

	//remove lights that do not overlap with this renderable
	lights = lights.filter(l=>l.overlaps(rc))

	var mesh = rc.mesh;
	var node = rc.node;
	var skeleton = rc.skin;
	var camera = this._camera;
	var material = rc.material;
	var primitive = rc.primitive;
	if(primitive == null || primitive == -1)
		primitive = gl.TRIANGLES;

	//assign all light info for this renderable
	var has_shadows = false;
	if( lights.length && !this.rendering_only_depth )
	{	
		var num = this._lights_uniforms.u_num_lights = Math.min( lights.length, 4 );
		for(var i = 0; i < num; ++i)
		{
			var light = lights[i];
			this._lights_uniforms.u_light_color[i*4] = light.color[0] * light.intensity;
			this._lights_uniforms.u_light_color[i*4+1] = light.color[1] * light.intensity;
			this._lights_uniforms.u_light_color[i*4+2] = light.color[2] * light.intensity;
			this._lights_uniforms.u_light_color[i*4 + 3] = light.light_type;
			if(light.light_type !== RD.DIRECTIONAL_LIGHT)
			{
				this._lights_uniforms.u_light_position.set(light._center,i*4);
				this._lights_uniforms.u_light_position[i*4 + 3] = light.max_distance;
			}
			this._lights_uniforms.u_light_front.set(light._front,i*4);
			this._lights_uniforms.u_light_params[i*4] = Math.cos( light.cone_start * DEG2RAD * 0.5 );
			this._lights_uniforms.u_light_params[i*4+1] = Math.cos( light.cone_end * DEG2RAD  * 0.5);
			this._lights_uniforms.u_light_params[i*4+2] = light._shadowmap_index;
			if(light._shadowmap_index !== -1)
			{
				var info = this.shadows_info.shadows[ light._shadowmap_index ];
				this.shadows_info.uniforms.u_shadowmap_rect.set( info.rect, i*4 );
				this.shadows_info.uniforms.u_shadowmap_vps.set( info.vp, i*16 );
				has_shadows |= true;	
			}
		}
	}	

	//get shader
	var shader = null;
	if (this.on_getShader)
	{
		shader = this.on_getShader( rc.node, camera );
		if(!shader)
			return;
	}
	else
	{
		var shader_name = this.shader_overwrite || material.shader_name;
		if(shader_name)
		{
			shader = gl.shaders[ shader_name ];
			if(!shader)
				return;
		}
		else
		{
			//generate automatic shader
			var shader_hash = 0;

			if( skeleton )
				shader_hash |= SHADER_MACROS.SKINNING;
			if( rc.morphs && 1)
				shader_hash |= SHADER_MACROS.MORPHTARGETS;
			if( rc.instances && this.supports_instancing)
				shader_hash |= SHADER_MACROS.INSTANCING;

			if( !this.rendering_only_depth )
			{
				if(primitive !== GL.TRIANGLES && primitive !== GL.TRIANGLE_STRIP && primitive !== GL.TRIANGLE_FAN)
					shader_hash |= SHADER_MACROS.NO_TRIANGLES;
				if(this.use_alpha_hash && material.blend_mode != 0)
					shader_hash |= SHADER_MACROS.ALPHA_HASH;
				if(this.use_flat_normal)
					shader_hash |= SHADER_MACROS.FLAT_NORMAL;
				if(this.use_secondary_buffer)
					shader_hash |= SHADER_MACROS.SECOND_BUFFER;

				if(this.rendering_flat)
					shader_hash |= SHADER_MACROS.FLAT_COLOR;
				else
				{
					if(this.use_fog)
						shader_hash |= SHADER_MACROS.FOG;
					if( mesh.vertexBuffers.colors )
						shader_hash |= SHADER_MACROS.COLOR;
					if( mesh.vertexBuffers.coords1 )
						shader_hash |= SHADER_MACROS.COORD1;
					if( material.textures.color )
						shader_hash |= SHADER_MACROS.TEXTURE;
					if( material.textures.albedo )
						shader_hash |= SHADER_MACROS.ALBEDO;
					if( material.textures.emissive )
						shader_hash |= SHADER_MACROS.EMISSIVE;
					if( material.textures.occlusion )
						shader_hash |= SHADER_MACROS.OCCLUSION;
					if( material.uv_transform )
						shader_hash |= SHADER_MACROS.UV_TRANSFORM;
					if( material.model === "unlit" )
						shader_hash |= SHADER_MACROS.UNLIT;
					if( lights.length )
					{
						shader_hash |= SHADER_MACROS.LIGHTS;
						if( has_shadows )
							shader_hash |= SHADER_MACROS.SHADOWS;
					}
				}

			}
	
			shader = this.pipelineShader.getShader( shader_hash );
		}
	}

	//check if shader supports instancing
	var instancing = false;
	if( rc.instances && this.supports_instancing )
		instancing = true;	
	if( instancing && !shader.attributes.u_model )
		instancing = false;

	//prepare textures
	var slot = 0;
	var texture = null;
	for(var i in material.textures)
	{
		var texture_name = material.textures[i];
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
			if(this.autoload_assets && texture_name.indexOf(".") != -1)
			this.loadTexture( texture_name, this.default_texture_settings );
			texture = gl.textures[ "white" ];
		}
		var texslot = slot++;
		//texture.setParameter(gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		material.uniforms[ texture_uniform_name ] = texture.bind( texslot );
		//gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		//texture.bind(0);
	}

	//weird case of mesh without textures
	if( !texture )
	{
		if(shader.samplers.u_albedo_texture || shader.samplers.u_color_texture )
			gl.textures[ "white" ].bind(0);
	}

	//flags
	this.enableItemFlags( material );

	//skinning
	if( skeleton && shader.uniformInfo.u_bones )
	{
		if(skeleton.constructor === RD.Skeleton)
		{
			this.bones = skeleton.computeFinalBoneMatrices( this.bones, mesh );
			shader.setUniform("u_bones", this.bones );
		}
		else if(skeleton._bone_matrices)
			shader.setUniform("u_bones", skeleton._bone_matrices );
	}

	//alpha cutoff
	if(material.alphaCutoff != null && material.alphaMode == "MASK")
		this._uniforms.u_global_alpha_clip = material.alphaCutoff;
	else
		this._uniforms.u_global_alpha_clip = -1;

	//upload uniforms to shader
	this._uniforms.u_model.set( rc.model );
	shader.uniforms( this._uniforms ); //globals
	if(lights.length)
		shader.uniforms( this._lights_uniforms );
	shader.uniforms( camera._uniforms ); //camera
	if(this.use_fog)
		shader.uniforms( this._fog_uniforms );
	shader.uniforms( this._phong_uniforms ); //light
	shader.setUniform("u_color", material._color);
	shader.setUniform("u_emissive", material._emissive);
	if(material.uv_transform)
		shader.setUniform( "u_uvtransform", material.uv_transform );

	shader.uniforms( material.uniforms ); //customs
	if( this.onNodeShaderUniforms )
		this.onNodeShaderUniforms( this, shader, node );
	if(shader.hasUniform("u_bayer_texture"))
		shader.uniforms({u_bayer_texture:this._bayer_texture.bind(slot++)});
	if(rc.morphs)
		shader.uniforms({u_morph_texture:rc.morphs.bind(slot++)});
	if(has_shadows)
	{
		this.shadows_info.uniforms.u_shadowmap = this.shadows_info.texture.bind(slot++);
		shader.uniforms(this.shadows_info.uniforms);
	}

	//draw calls
	var group = null;
	if( rc.group_index != null && mesh.info && mesh.info.groups && mesh.info.groups[ rc.group_index ] )
		group = mesh.info.groups[ rc.group_index ];

	if( instancing )
	{
		instancing_uniforms.u_model = rc.instances;
		if(group)
			shader.drawInstanced( mesh, primitive, rc.index_buffer_name, instancing_uniforms, group.start, group.length );
		else if(node.draw_range)
			shader.drawInstanced( mesh, primitive, rc.index_buffer_name, instancing_uniforms, rc.draw_range[0], rc.draw_range[1] );
		else
			shader.drawInstanced( mesh, primitive, rc.index_buffer_name, instancing_uniforms );
	}
	else if( rc.instances ) // in case the instancing extension is not supported, this will never be used...
	{
		//enable geometry
		//...	
		for(var i = 0; i < rc.instances.length; i++)
		{
			shader.setUniform("u_model", rc.instances[i]);
			if(group)
				shader.drawRange( mesh, primitive, group.start, group.length, rc.index_buffer_name );
			else if(rc.draw_range)
				shader.drawRange( mesh, primitive, rc.index_buffer_name, rc.draw_range[0], rc.draw_range[1] );
			else
				shader.draw( mesh, primitive, rc.index_buffer_name );
			this.stats.draw_calls += 1;
		}
		this.stats.draw_calls--;
	}
	else //no instancing
	{
		if( group )
			shader.drawRange( mesh, primitive, group.start, group.length, rc.index_buffer_name );
		else if(rc.draw_range)
			shader.drawRange( mesh, primitive, rc.index_buffer_name, rc.draw_range[0], rc.draw_range[1] );
		else
			shader.draw( mesh, primitive, rc.index_buffer_name );
	}

	this.disableItemFlags( material );
	this.stats.draw_calls += 1;
}

//you can modify this ones to tune your shader
Renderer.shader_snippets = {
	testShadowmap: `
	uniform vec4 u_shadowmap_rect[4];
	uniform mat4 u_shadowmap_vps[4];
	uniform sampler2D u_shadowmap;

	float testShadowmap( vec3 pos, vec4 rect, mat4 vp )
	{
		const float bias = 0.004;
		vec4 proj = vp * vec4(pos, 1.0);
		vec2 sample = (proj.xy / proj.w) * vec2(0.5) + vec2(0.5);
		if(sample.x >= 0.0 && sample.x <= 1.0 && sample.y >= 0.0 && sample.y <= 1.0 )
		{
			sample = remap( sample, vec2(0.0), vec2(1.0), rect.xy, rect.zw );
			float depth = texture( u_shadowmap, sample ).x;
			if( depth > 0.0 && depth < 1.0 && depth <= ( ((proj.z-bias) / proj.w) * 0.5 + 0.5) )
				return 0.0;
		}
		return 1.0;
	}
	`,
	fog_code: `
		//float normalized_depth = linearize_depth(gl_FragCoord.z);//(gl_FragCoord.z * gl_FragCoord.w);
		float fog_factor = length( u_camera_position - v_pos ) / u_camera_planes.y;
		color.xyz = mix(color.xyz, u_fog_color.xyz, pow( fog_factor, 1.0 / u_fog_color.w ));
	`,
	modify_ndotl:``,
	modify_attenuation: ``,
	modify_prelight_equation: ``,
	modify_light_equation: ``,
	modify_color: ``,
	modify_emissive: ``,
	custom_uniforms:``
}

Renderer.getMasterVertexShader = function(macros){ return `#version 300 es
precision highp float;
in vec3 a_vertex;
#ifndef FLAT_NORMAL
	in vec3 a_normal;
#endif
in vec2 a_coord;
#ifdef COORD1
	in vec2 a_coord1;
	out vec2 v_coord1;
#endif
out vec3 v_pos;
out vec3 v_normal;
out vec2 v_coord;
#ifdef COLOR
	in vec4 a_color;
	out vec4 v_color;
#endif

${macros & SHADER_MACROS.SKINNING ? RD.Skeleton.shader_code : ''}

#ifdef MORPHTARGETS
	uniform sampler2D u_morph_texture;
#endif

#ifdef INSTANCING
	in mat4 u_model;
#else
	uniform mat4 u_model;
#endif
uniform mat4 u_viewprojection;
uniform float u_point_size;

#ifdef UV_TRANSFORM
uniform mat3 u_uvtransform;
#endif

void main() {
	v_pos = a_vertex;

	${macros & SHADER_MACROS.MORPHTARGETS ? 'v_pos += texelFetch(u_morph_texture,ivec2(gl_VertexID,0),0).xyz;' : ''}
	
	${macros & SHADER_MACROS.SKINNING ? 'computeSkinning(v_pos,v_normal);' : ''}

	v_pos = (u_model * vec4(v_pos,1.0)).xyz;
	#ifndef FLAT_NORMAL
	v_normal = a_normal;
	${macros & SHADER_MACROS.MORPHTARGETS ? 'v_pos += texelFetch(u_morph_texture,ivec2(gl_VertexID,1),0).xyz;' : ''}
	v_normal = (u_model * vec4(v_normal,0.0)).xyz;
	#endif
	v_coord = a_coord;
	#ifdef UV_TRANSFORM
		v_coord = (u_uvtransform * vec3(v_coord,1.0)).xy;
	#endif

	#ifdef COORD1
		v_coord1 = a_coord1;
	#endif
	#ifdef COLOR
	v_color = a_color;
	#endif
	gl_Position = u_viewprojection * vec4( v_pos, 1.0 );
	gl_PointSize = u_point_size;
}
`;
}

Renderer.getMasterFragmentShader = function(){ return `#version 300 es
	
	precision highp float;
	in vec3 v_pos;
	in vec2 v_coord;
	in vec3 v_normal;
	#ifdef COLOR
	in vec4 v_color;
	#endif
	#ifdef COORD1
		in vec2 v_coord1;
	#else
		vec2 v_coord1;
	#endif	

	//material
	uniform vec4 u_color;
	uniform vec3 u_emissive;
	#ifdef TEXTURE
		uniform sampler2D u_color_texture;
	#endif
	#ifdef ALBEDO
		uniform sampler2D u_albedo_texture;
	#endif
	#ifdef EMISSIVE
		uniform sampler2D u_emissive_texture;
	#endif
	#ifdef OCCLUSION
		uniform sampler2D u_occlusion_texture;
	#endif
	uniform float u_global_alpha_clip;

	//globals
	uniform vec3 u_ambient;
	uniform vec3 u_sun_light_vector;
	uniform vec3 u_sun_light_color;

	#ifdef FOG
		uniform vec4 u_fog_color;
	#endif

	vec2 remap(in vec2 value, in vec2 low1, in vec2 high1, in vec2 low2, in vec2 high2 ) { vec2 range1 = high1 - low1; vec2 range2 = high2 - low2; return low2 + range2 * (value - low1) / range1; }	

	#ifdef LIGHTS
		uniform int u_num_lights;
		uniform vec4 u_light_color[4]; //color, type
		uniform vec4 u_light_position[4]; //pos or vector, max_dist
		uniform vec4 u_light_front[4]; //front, 
		uniform vec4 u_light_params[4]; //cos cone start, cos cone end, shadowmap index, ?
	#endif

	#ifdef SHADOWS
	${Renderer.shader_snippets.testShadowmap}
	#endif

	uniform sampler2D u_bayer_texture;
	float bayer8x8() {
		int x = int(mod(gl_FragCoord.x, 8.0));
		int y = int(mod(gl_FragCoord.y, 8.0));
		return texture( u_bayer_texture, vec2(float(x)/8.0,float(y)/8.0)).x * 4.0;
	}

	uniform vec4 u_res;
	uniform vec3 u_camera_position;
	uniform vec2 u_camera_planes;

	float linearize_depth(float d)
	{
		float z_n = 2.0 * d - 1.0;
		return 2.0 * u_camera_planes.x * u_camera_planes.y / (u_camera_planes.y + u_camera_planes.x - z_n * (u_camera_planes.y - u_camera_planes.x));
	}

	${Renderer.shader_snippets.custom_uniforms}

	out vec4 FragColor;

	void main() {
		vec4 color = u_color;
		#ifdef FLAT_COLOR
			FragColor = color;
			return;
		#endif

		#ifndef COORD1
			v_coord1 = v_coord;
		#endif		
		#ifdef ALBEDO
			color *= texture(u_albedo_texture, v_coord);
		#endif
		#ifdef TEXTURE
			color *= texture(u_color_texture, v_coord);
		#endif
		#ifdef COLOR
			color *= v_color;
		#endif
		if(color.a <= u_global_alpha_clip)
			discard;
		#ifdef ALPHA_HASH
		if(color.a < bayer8x8())
			discard;
		#endif

		#ifdef FLAT_NORMAL
			vec3 A = dFdx(v_pos);
			vec3 B = dFdy(v_pos);
			vec3 N = normalize(cross(A,B));
		#else
			vec3 N = normalize(v_normal);
		#endif

		#ifdef NO_TRIANGLES
			N = normalize(v_pos - u_camera_position);
		#endif

		float NdotL = (dot(N,u_sun_light_vector)*0.5 + 0.5);
		#ifdef UNLIT
			NdotL = 1.0;
		#endif
		vec3 total_light = u_ambient + u_sun_light_color * NdotL;
		#ifdef OCCLUSION
			total_light = texture(u_occlusion_texture, v_coord1).xyz;
		#endif
		#ifdef LIGHTS
		for(int i = 0; i < 4; ++i)
		{
			if(i > u_num_lights)
				break;
			vec3 L = u_light_position[i].xyz - v_pos;
			int light_type = int(u_light_color[i].w);
			float att = 1.0;
			if( light_type == 3 ) //directional
			{
				L = -u_light_front[i].xyz;
			}
			else //spot and point
			{
				float light_dist = length(L);
				if(light_dist > u_light_position[i].w)
					continue;
				L /= light_dist;
				att = max(0.0,(u_light_position[i].w - light_dist) / u_light_position[i].w);
			}
			NdotL = max( 0.0, dot( N, L ) );
			#ifdef UNLIT
				NdotL = 1.0;
			#endif
			${Renderer.shader_snippets.modify_ndotl}
			
			if( light_type == 1 ) //spot
			{
				float cos_angle = dot( u_light_front[i].xyz, -L );
				if(cos_angle < u_light_params[i].y )
					att = 0.0;
				else if (cos_angle < u_light_params[i].x )
					att *= 1.0 - (cos_angle - u_light_params[i].x) / (u_light_params[i].y - u_light_params[i].x);
			}

			${Renderer.shader_snippets.modify_attenuation}

			#ifdef SHADOWS
				if (u_light_params[i].z != -1.0) //has shadowmap
				{
					att *= testShadowmap( v_pos, u_shadowmap_rect[ i ], u_shadowmap_vps[ i ] );
				}
			#endif

			${Renderer.shader_snippets.modify_prelight_equation}
			vec3 light = u_light_color[i].xyz * att * NdotL;
			${Renderer.shader_snippets.modify_light_equation}
			total_light += light;
		}
		#endif

		color.xyz *= total_light;
		vec3 emissive = u_emissive;
		#ifdef EMISSIVE
			emissive *= texture(u_emissive_texture, v_coord).xyz;
		#endif

		${Renderer.shader_snippets.modify_emissive}
		color.xyz += emissive;

		#ifdef FOG
			${Renderer.shader_snippets.fog_code}
		#endif

		${Renderer.shader_snippets.modify_color}

		FragColor = color;
		#ifdef SECOND_BUFFER
		#endif
	}
	`;
}

Renderer.prototype.clearMorphTargets = function()
{
	this.morph_textures.forEach(m=>m.delete());
	this.morph_textures.clear();
}

Renderer.prototype.computeMorphTargets = function(node)
{
	if(!node.morphs.length)
		return;
	var mesh = gl.meshes[ node.mesh ];
	if(!mesh.morphs)
		return null;
	var vertices = mesh.getBuffer("vertices").data;
	var numVertices = vertices.length / 3;
	var final_tex = this.morph_textures.get(mesh);
	if(!final_tex)
	{
		final_tex = new GL.Texture(numVertices,2,{ type: GL.HALF_FLOAT, format: GL.RGBA, filter: GL.NEAREST, wrap: GL.CLAMP_TO_EDGE });
		this.morph_textures.set(mesh, final_tex);
	}
	var shader = GL.Shader.getColoredScreenShader();
	var weights = 0;

	for(let i = 0; i < node.morphs.length; ++i)
	{
		var morph_info = node.morphs[i];
		if(morph_info.weight <= 0)
			continue;
		weights += Math.abs(morph_info.weight);
		var morph_vertices_buffer = mesh.morphs[i].buffers.vertices;
		var morph_normals_buffer = mesh.morphs[i].buffers.normals;
		var morph_texture = this.morph_textures.get(morph_vertices_buffer);
		if(!morph_texture)
		{
			var data = new Float32Array( morph_vertices_buffer.length * 2 );
			data.set( morph_vertices_buffer, 0 );
			if(morph_normals_buffer)
				data.set( morph_normals_buffer, morph_vertices_buffer.length );
			//for(let j = 0; j < data.length; ++j) //as delta
			//	data[j] -= vertices[j];
			morph_texture = new GL.Texture(numVertices,2,{ type: GL.FLOAT, format: GL.RGB, pixel_data: data, filter:GL.NEAREST, wrap: GL.CLAMP_TO_EDGE });
			this.morph_textures.set( morph_vertices_buffer, morph_texture );
		}
	}

	if(weights < 0.001) return null;

	final_tex.drawTo(()=>{
		gl.clearColor(0,0,0,0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.disable(GL.DEPTH_TEST);
		gl.enable(GL.BLEND);
		gl.blendFunc(GL.SRC_ALPHA,GL.ONE);
		for(let i = 0; i < node.morphs.length; ++i)
		{
			var morph_info = node.morphs[i];
			if(morph_info.weight <= 0)
				continue;
			var morph_vertices_buffer = mesh.morphs[i].buffers.vertices;
			var morph_texture = this.morph_textures.get(morph_vertices_buffer);
			if(!morph_texture)
				continue;
			morph_texture.toViewport(shader,{ u_color:[1,1,1,morph_info.weight]});
		}
	});
	
	return final_tex;
}

Renderer.prototype.enableCamera = function(camera)
{
	this._camera = camera;	
	camera.updateMatrices(); //multiply
	camera.extractPlanes(); //for frustrum culling
}

Renderer.prototype.renderSkybox = function(camera, texture_name)
{
	var shader = this._skybox_shader;
	var mesh = gl.meshes["cube"];
	var texture = gl.textures[texture_name];
	if(!texture)
	{
		if(this.autoload_assets && texture_name.indexOf(".") != -1)
			this.loadTexture( texture_name, renderer.default_texture_settings );
		return;
	}
	var model = this._model_matrix;
	mat4.identity(model);
	gl.disable( gl.DEPTH_TEST );
	gl.disable( gl.CULL_FACE );
	mat4.setTranslation(model,camera.position);
	var f = camera.far * 0.5 + camera.near * 0.5;
	mat4.scale(model,model,[f,f,f])
	this.renderMesh( model, mesh, texture, [1,1,1,1], shader );
}

/** Allows to render into a separate buffer some renderables and compute an outline, that is overlayed on top */
Renderer.prototype.renderOutline = function( renderables, camera )
{
	var w = gl.viewport_data[2];
	var h = gl.viewport_data[3];
	if(!this._selection_buffer || this._selection_buffer.width != w || this._selection_buffer.height != h)
	{
		this._selection_buffer = new GL.Texture( w, h, { magFilter: gl.NEAREST});
	}

	if(!Renderer.outline_material)
		Renderer.outline_material = new RD.Material();

	gl.disable(gl.SCISSOR_TEST);


	var shadername = this.shader;
	this._selection_buffer.drawTo(()=>{
		gl.clearColor(0,0,0,1);
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
		var tmp = this.onNodeShaderUniforms;
		this.onNodeShaderUniforms = function(node,shader) { shader.setUniform("u_color",[1,1,1,1]); };
		var tmp2 = this.pipeline;
		this.pipeline = null;

		this.overwrite_material = RD.Renderer.outline_material;
		this.rendering_flat = true;
		for(let i = 0; i < renderables.length; ++i)
			this.renderRenderable( renderables[i], [] );
		this.shader_overwrite = null;
		this.onNodeShaderUniforms = tmp;
		this.rendering_flat = false;
		this.pipeline = tmp2;
		this.overwrite_material = null;
	});
	var outline_shader = gl.shaders["outline"];
	if(!outline_shader)
		outline_shader = gl.shaders["outline"] = GL.Shader.createFX(`
			vec3 colorU = texture2D(u_texture, uv - vec2(0.0,u_res.y)).xyz;
			vec3 colorL = texture2D(u_texture, uv - vec2(u_res.x,0.0)).xyz;
			`+ (this.outline_diagonals ? `
			vec3 outline = abs(color.xyz - colorU) * 0.3 + abs(color.xyz - colorL) * 0.3;
			vec3 colorUL = texture2D(u_texture, uv - u_res).xyz;
			vec3 colorUR = texture2D(u_texture, uv + vec2(u_res.x,-u_res.y)).xyz;
			vec3 colorDL = texture2D(u_texture, uv - vec2(u_res.x,-u_res.y)).xyz;
			outline += (abs(color.xyz - colorUL) + abs(color.xyz - colorDL) + abs(color.xyz - colorUR)) * 0.1;
			`:`
			vec3 outline = vec3( abs(color.x - colorU.x) + abs(color.x - colorL.x) > 0.0 ? 1.0 : 0.0);
			`) + `
			color = vec4( clamp(outline,vec3(0.0),vec3(1.0)),1.0 );
			//color = texture2D(u_texture, uv);
		`,"uniform vec2 u_res;\n");

	gl.blendFunc(gl.ONE,gl.ONE);
	gl.enable(gl.BLEND);
	gl.disable(gl.DEPTH_TEST);
	this._selection_buffer.toViewport(outline_shader, {u_color:this.outline_color, u_res: [1/w,1/h]});
	gl.disable(gl.BLEND);
	gl.enable(gl.DEPTH_TEST);
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

Renderer.prototype.updateShadowmaps = function( lights, renderables, main_camera_renderables )
{
	var SHADOWMAP_ATLAS_SIZE = 2048;

	lights.forEach(l=>l._shadowmap_index = -1);
	var casting_lights = lights.filter(l=>l.cast_shadows && l.light_type !== RD.POINT_LIGHT);
	if(casting_lights.length == 0)
		return;

	///prepare shadowmap texture
	if(!this.shadows_info)
	{
		var texture = new GL.Texture( SHADOWMAP_ATLAS_SIZE, SHADOWMAP_ATLAS_SIZE, { format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT, filter: gl.NEAREST });
		this.shadows_info = {
			num_shadows: 0,
			texture,
			fbo: new GL.FBO(null,texture),
			uniforms: {
				u_shadowmap: 0,
				u_shadowmap_rect: new Float32Array(4*4),
				u_shadowmap_vps: new Float32Array(16*4),
			},
			shadows: []
		}
	}

	this.shadows_info.fbo.bind();
	gl.clear( gl.DEPTH_BUFFER_BIT  ); //| gl.COLOR_BUFFER_BIT

	var shadow_size = SHADOWMAP_ATLAS_SIZE / 2;
	if(!this.shadow_camera)
		this.shadow_camera = new Camera();
	var camera = this.shadow_camera;
	this.rendering_only_depth = true;

	for(var i = 0; i < casting_lights.length; ++i)
	{
		var light = casting_lights[i];

		//assign area
		var x = (i%2) * shadow_size;
		var y = Math.floor(i/2)*shadow_size;
		gl.viewport(x,y,shadow_size,shadow_size);

		//prepare camera
		if(light.light_type === RD.SPOT_LIGHT)
			camera.perspective(light.cone_end, 1, 0.1, light.max_distance);
		else
			camera.orthographic(light.area, 0.1, light.max_distance, 1);
		camera.lookAt( light.getGlobalPosition(), light.localToGlobal([0,0,-1]), [0,1,0]);

		this.enableCamera( camera );
		gl.enable(gl.DEPTH_TEST);
		
		//render content
		var visible_renderables = renderables.filter(rc=>rc.instances || rc.skin || camera.testMesh( rc.mesh, rc.model) !== RD.CLIP_OUTSIDE);
		visible_renderables = this.groupRenderablesForInstancing(visible_renderables); //grouped
		for(var j = 0; j < visible_renderables.length; ++j)
		{
			var rc = visible_renderables[j];
			this.renderRenderable( rc, [] );
		}

		//copy info
		light._shadowmap_index = i;

		var info = this.shadows_info.shadows[i];
		if(!info)
			info = this.shadows_info.shadows[i] = {
				rect: vec4.create(),
				vp: mat4.create()
			};
		info.rect.set([x/SHADOWMAP_ATLAS_SIZE,y/SHADOWMAP_ATLAS_SIZE,(x+shadow_size)/SHADOWMAP_ATLAS_SIZE,(y+shadow_size)/SHADOWMAP_ATLAS_SIZE]);
		info.vp.set(camera._viewprojection_matrix);
		this.stats.updated_shadowmaps++;
	}

	this.shadows_info.num_shadows = casting_lights.length;
	this.shadows_info.fbo.unbind();
	this.shadows_info.texture.bind();
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
	this.rendering_only_depth = false;
}

//used to render skybox, boundings, ...
Renderer.prototype.renderMesh = function( model, mesh, texture, color, shader, mode, index_buffer_name, group_index )
{
	if(!mesh)
		return;
	if(!model)
		model = RD.IDENTITY;
	this._uniforms.u_model.set( model );
	if(!shader)
		shader = this.getMasterShader( texture ? SHADER_MACROS.ALBEDO : 0 );
	if( texture )
		this._uniforms.u_texture = texture.bind(0);
	shader.uniforms(this._uniforms);
	shader.uniforms(this._camera._uniforms);
	if( color )
		shader.uniforms({u_color: color});
	if(group_index != null)
	{
		var group = mesh.info.groups[group_index];
		shader.drawRange( mesh, mode == null ? gl.TRIANGLES : mode,  group.start, group.length, index_buffer_name );
	}
	else
		shader.draw( mesh, mode == null ? gl.TRIANGLES : mode, index_buffer_name );
	this.stats.draw_calls += 1;
}

/** Camera is optional */
Renderer.prototype.getAllRenderables = function( nodes, layers, camera )
{
	//reset render calls pool and clear all 
	this.resetRenderablesPool();
	var rcs = this.renderables;
	rcs.length = 0;

	this.lights.length = 0;
	this.outline_renderables.length = 0;

	//extract render calls from scene nodes
	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		node.flags.was_renderer = false;
		if(node.flags.visible === false || !(node.layers & layers) )
			continue;
		if(node.mesh || node._mesh)
			this.getNodeRenderables( node, camera );
		if(node.constructor === RD.Light)
		{
			node.getGlobalVector(RD.FRONT, node._front);
			node.getGlobalPosition(node._center);
			this.lights.push(node);
		}
	}

	//sort by alpha and distance
	if(this.onFilterRenderables)
		this.onFilterRenderables( rcs );
	if(camera)
	{
		for(var i = 0; i < rcs.length; ++i)
			rcs[i].computeRenderPriority( camera._position );
		rcs = rcs.sort( (a,b)=>b._render_priority - a._render_priority );
	}
	return rcs;
}

Renderer.prototype.resetStats = function()
{
	this.stats.draw_calls = 0;
	this.stats.updated_shadowmaps = 0;
}

Renderer.prototype.resetRenderablesPool = function()
{
	this.used_renderables = 0;
}

Renderer.prototype.getRenderablesFromPool = function()
{
	if( this.used_renderables < this.renderables_pool.length )
	{
		var rc = this.renderables_pool[this.used_renderables];
		this.used_renderables++;
		return rc;
	}

	var rc = new RD.Renderable();
	rc.id = this.used_renderables;
	this.renderables_pool.push( rc );
	this.used_renderables++;
	return rc;
}

Renderer.prototype.getNodeRenderables = function( node, camera )
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
			if( this.autoload_assets && node.mesh.indexOf(".") != -1)
				this.loadMesh( node.mesh );
			return;
		}
	}

	if(!mesh)
		return;

	//skinning can work in two ways: through a RD.Skeleton, or through info about the joints node in the scene
	var skinning = node.skeleton || node.skin || null;
	if( skinning && !skinning.bones && !skinning.joints )
		skinning = null;
	if( skinning && skinning.bones && !skinning.bones.length )
		skinning = null;
	if( skinning && skinning.joints && !skinning.joints.length )
		skinning = null;

	if(skinning && skinning.joints)
	{
		//at least once
		if(!skinning._bone_matrices || this.force_update_bones)
			node.updateSkinningBones( node._parent ); //use parent node as root
	}

	if(!Renderer.temp_bbox)
	{
		Renderer.temp_bbox = BBox.create();
		Renderer.aabb_center = BBox.getCenter( Renderer.temp_bbox );
		Renderer.aabb_halfsize = BBox.getHalfsize( Renderer.temp_bbox );
	}
	var aabb = Renderer.temp_bbox;
	BBox.transformMat4( aabb, mesh.getBoundingBox(), node._global_matrix );

	//check if inside frustum (skinned objects are not tested)
	if(!skinning && camera && !node._instances)
	{
		if ( camera.testBox( Renderer.aabb_center, Renderer.aabb_halfsize ) == RD.CLIP_OUTSIDE )
			return;
		node._last_rendered_frame = this.frame; //mark last visible frame
	}

	var morphs = null;
	if( node.morphs)
		morphs = this.computeMorphTargets(node);

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

			var rc = this.getRenderablesFromPool();
			rc.material = material;
			rc.model = node._global_matrix;
			rc.mesh = mesh;
			rc.group_index = i;
			rc.node = node;
			rc.draw_range = null;
			rc._render_priority = material.render_priority || 0;
			rc.instances = node._instances;
			rc.flags = (rc.instances || skinning) ? RENDERABLE_IGNORE_BOUNDING : 0;
			rc.reverse_faces = node.flags.frontFace == GL.CW;
			rc.skin = skinning;
			rc.index_buffer_name = "triangles";
			rc.primitive = prim.mode != null ? prim.mode : material.primitive;
			rc.bounding.set( aabb );
			rc.morphs = morphs;
			this.renderables.push( rc );

			if(i == 0 && node.flags.outline)
			{
				var outline_rc = this.getRenderablesFromPool();
				outline_rc.copyFrom(rc);
				outline_rc.group_index = -1;
				this.outline_renderables.push(outline_rc);
			}
		}

		return;
	}

	if(node.material)
	{
		var material = RD.Materials[ node.material ];
		if(material)
		{
			var rc = this.getRenderablesFromPool();
			rc.material = material;
			rc.model = node._global_matrix;
			rc.mesh = mesh;
			rc.group_index = node.submesh;
			rc.node = node;
			rc.instances = node._instances;
			rc.skin = skinning;
			rc.draw_range = node.draw_range;
			rc.primitive = node.primitive != null ? node.primitive : material.primitive;
			rc._render_priority = material.render_priority || 0;
			rc.reverse_faces = node.flags.frontFace == GL.CW;
			rc.bounding.set( aabb );
			rc.index_buffer_name = node.indices_name || "triangles";
			rc.morphs = morphs;
			rc.flags = (rc.instances || skinning) ? RENDERABLE_IGNORE_BOUNDING : 0;
			this.renderables.push( rc );

			if(node.flags.outline)
			{
				var outline_rc = this.getRenderablesFromPool();
				outline_rc.copyFrom(rc);
				outline_rc.group_index = -1;
				this.outline_renderables.push(outline_rc);
			}			
		}
	}
}

Renderer._last_mesh_id = 0;

Renderer.prototype.groupRenderablesForInstancing = function(rcs)
{
	var groups = new Map();

	var no_group = 0; //used to force no grouping

	//find groups
	for(var i = 0; i < rcs.length; ++i)
	{
		var rc = rcs[i];
		var key = null;
		if(!rc.mesh.name)
			rc.mesh.name = "##M" + Renderer._last_mesh_id++;
		if (!rc.instances && !rc.skin && !rc.draw_range)
			key = rc.mesh.name + ":" + rc.group_index + "/" + rc.primitive + "/" + rc.material.name + (rc.reverse_faces ? "[R]" : "");
		else
			key = no_group++;
		if(!groups.has(key))
			groups.set(key,[rc]);
		else
			groups.get(key).push(rc);
	}

	var final_rcs = [];

	//for every group
	var values = groups.values();
	for(var group of values)
	{
		if( group.length == 0 )
			continue;

		//single
		if( group.length == 1 )
		{
			var rc = group[0];
			//rc.instances = null;
			if(!this.debug_instancing)
				final_rcs.push( rc );
			continue;
		}

		var rc = this.getRenderablesFromPool();
		rc.copyFrom( group[0] );
		rc.instances = new Array(group.length);
		for(var j = 0; j < group.length; ++j)
		{
			var inst = group[j];
			if(j)//skip first one
				BBox.merge( rc.bounding, rc.bounding, inst.bounding );
			rc.instances[j] = inst.model;
		}
		final_rcs.push( rc );
	}

	return final_rcs;
}

//allows to pass a mesh or a bounding box
//if matrix specified, the bbox will be TSR on rendering (rendered as OOBB), not recomputed using the matrix
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
	if(this.reverse_normals) //used in shadowmaps
		ff = !ff;
	gl.frontFace( ff ? gl.CW : gl.CCW );
	if( item.flags.depth_test === false )
		gl.disable( gl.DEPTH_TEST );
	else
		gl.enable( gl.DEPTH_TEST );
	if( item.flags.depth_write === false )
		gl.depthMask( false );
	if( item.flags.two_sided === true || this.disable_cull_face)
		gl.disable( gl.CULL_FACE );
	else
		gl.enable( gl.CULL_FACE );

	/* I cant see any change
	if(item.extras && item.extras.offsetDepth)
	{
		gl.enable(gl.POLYGON_OFFSET_FILL);
		gl.polygonOffset( 1, 1 ); //item.extras.offsetDepth
	}
	*/

	
	//blend
	if(	!this.rendering_only_depth && item.blend_mode !== RD.BLEND_NONE && !this.use_alpha_hash)
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
	if(!this.rendering_only_depth && !this.use_alpha_hash && item.alphaMode === "BLEND")
	{
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		gl.depthMask( false );
	}

	/*
	if(item.extras && item.extras.offsetDepth)
	{
		gl.disable(gl.POLYGON_OFFSET_FILL);
	}
	*/
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

RD.points_vs_shader = `
precision highp float;
attribute vec3 a_vertex;
attribute vec4 a_extra4;
varying vec3 v_pos;
varying vec4 v_extra4;
uniform mat4 u_model;
uniform mat4 u_viewprojection;
uniform vec4 u_viewport;
uniform float u_camera_perspective;
uniform float u_pointSize;

float computePointSize( float radius, float w )
{
	if(radius < 0.0)
		return -radius;
	return u_viewport.w * u_camera_perspective * radius / w;
}

void main() {
	v_pos = (u_model * vec4(a_vertex,1.0)).xyz;
	v_extra4 = a_extra4;
	gl_Position = u_viewprojection * vec4(v_pos,1.0);
	gl_PointSize = computePointSize( u_pointSize, gl_Position.w );
}
`;

RD.points_fs_shader = `
precision highp float;
uniform vec4 u_color;
varying vec4 v_extra4;
vec2 remap(in vec2 value, in vec2 low1, in vec2 high1, in vec2 low2, in vec2 high2 ) { vec2 range1 = high1 - low1; vec2 range2 = high2 - low2; return low2 + range2 * (value - low1) / range1; }
#ifdef TEXTURED
	uniform sampler2D u_texture;
#endif
#ifdef FS_UNIFORMS
	FS_UNIFORMS
#endif

void main() {
	vec4 color = u_color;
	#ifdef COLORED
		color *= v_extra4;
	#endif
	#ifdef TEXTURED
		color *= texture2D( u_texture, gl_FragCoord );
	#endif
	#ifdef FS_CODE
		FS_CODE
	#endif
	gl_FragColor = color;
}
`;

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

RD.lines_vs_shader = `
precision highp float;
attribute vec3 a_vertex;
attribute vec3 a_normal;
attribute vec2 a_extra2;
uniform mat4 u_model;
uniform mat4 u_viewprojection;
uniform vec4 u_viewport;
uniform vec3 u_camera_front;
uniform vec3 u_camera_position;
uniform float u_camera_perspective;
uniform float u_lineWidth;

float computePointSize( float radius, float w )
{
	if(radius < 0.0)
		return -radius;
	return u_viewport.w * u_camera_perspective * radius / w;
}
void main() {
	vec3 T = normalize( (u_model * vec4(a_normal,0.0)).xyz );
	vec3 pos = (u_model * vec4(a_vertex,1.0)).xyz;
	vec3 pos2 = (u_model * vec4(a_vertex + T,1.0)).xyz;
	vec3 front = u_camera_front;//normalize( a_vertex - u_camera_position );
	T = normalize( pos2 - pos ) ;
	//float proj_w = (u_viewprojection * vec4(a_vertex,1.0)).w;
	//float fixed_size_factor = computePointSize( u_lineWidth, proj_w );
	vec3 side = normalize( cross(T,front) * a_extra2.x ) * u_lineWidth;
	pos += side;
	gl_Position = u_viewprojection * vec4(pos,1.0);
}
`;

RD.Renderer.prototype.drawImage = function( texture, sx, sy, sw, sh, x, y, w, h ) {
	if(texture.constructor === String)
		texture = this.loadTexture(texture);
	if(!texture)
		return;
	if(sw==null||sh==null)
	{
		x = sx;
		y = sy;
		sw = w = texture.width;
		sh = h = texture.height;
	}
	else if(x==null||y==null||w==null||h==null)
	{
		x = sx;
		y = sy;
		w = sw;
		h = sh;
		sx = 0;
		sy = 0;
		sw = texture.width;
		sh = texture.height;
	}
	var shader = this.shaders["_textured_quad"];
	if(!shader)
	{
		var vs = `
		precision highp float;
		attribute vec3 a_vertex;
		attribute vec2 a_coord;
		varying vec2 v_coord;
		uniform vec4 u_rect;
		uniform vec4 u_src_rect;
		uniform vec4 u_viewport;
		float remap(in float value, in float low1, in float high1, in float low2, in float high2 ) { float range1 = high1 - low1; float range2 = high2 - low2; return low2 + range2 * (value - low1) / range1; }
		
		void main() {
			v_coord = a_coord;
			vec4 pos = vec4(a_coord * 2.0 - 1.0, 0.0, 1.0);
			pos.x = remap(pos.x, -1.0, 1.0, u_rect.x, u_rect.x + u_rect.z );
			pos.x = remap(pos.x, 0.0, u_viewport.z, -1.0, 1.0 );
			pos.y = remap(pos.y, -1.0, 1.0, u_rect.y, u_rect.y + u_rect.w );
			pos.y = remap(pos.y, 0.0, u_viewport.w, 1.0, -1.0 );
			v_coord.x = remap( v_coord.x, 0.0, 1.0, u_src_rect.x, u_src_rect.x + u_src_rect.z );
			v_coord.y = remap( v_coord.y, 1.0, 0.0, u_src_rect.y, u_src_rect.y + u_src_rect.w );
			gl_Position = pos;
		}
		`

		var fs = `
		precision highp float;
		varying vec2 v_coord;
		uniform vec4 u_color;
		uniform sampler2D u_texture;
		void main() {
			vec4 color = u_color * texture2D( u_texture, v_coord );
			if(color.a == 0.0) discard;
			gl_FragColor = color;
		}
		`;
		shader = this.shaders["_textured_quad"] = new GL.Shader( vs, fs );
	}
	var mesh = GL.Mesh.getScreenQuad();
	shader.bind();
	shader.setUniform( "u_color", this._color );
	shader.setUniform( "u_rect", [x,y,w,h] );
	shader.setUniform( "u_src_rect", [sx / texture.width,sy / texture.height,sw / texture.width,sh / texture.height] );
	shader.setUniform( "u_viewport", gl.viewport_data );	
	shader.setUniform( "u_texture", texture.bind(0) );
	gl.disable( GL.DEPTH_TEST );
	gl.disable( GL.CULL_FACE );
	shader.draw( mesh, GL.TRIANGLES );
}

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

Renderer.prototype.createShaders = function()
{
	var vertex_shader = this._vertex_shader = `
		precision highp float;
		attribute vec3 a_vertex;
		attribute vec3 a_normal;
		attribute vec2 a_coord;
		varying vec3 v_pos;
		varying vec3 v_normal;
		varying vec2 v_coord;
		#ifdef COLOR
		attribute vec4 a_color;
		varying vec4 v_color;
		#endif
		uniform mat4 u_model;
		uniform mat4 u_viewprojection;
		void main() {
			v_pos = a_vertex;
			v_normal = a_normal;
			v_pos = (u_model * vec4(v_pos,1.0)).xyz;
			v_normal = (u_model * vec4(v_normal,0.0)).xyz;
			v_coord = a_coord;
			#ifdef COLOR
			v_color = a_color;
			#endif
			gl_Position = u_viewprojection * vec4( v_pos, 1.0 );
			gl_PointSize = 2.0;
		}
	`;
		
	var fragment_shader = this._flat_fragment_shader = `
				precision highp float;
				uniform vec4 u_color;
				#ifdef COLOR
				varying vec4 v_color;
				#endif
				void main() {
					vec4 color = u_color;
					#ifdef COLOR
					color *= v_color;
					#endif
				  gl_FragColor = color;
				}
	`;

	gl.shaders["flat"] = this._flat_shader = new GL.Shader( vertex_shader, fragment_shader );
	gl.shaders["flat_color"] = this._flat_instancing_shader = new GL.Shader(vertex_shader, fragment_shader, { COLOR:"" });
	
	this._point_shader = new GL.Shader(`
				precision highp float;
				attribute vec3 a_vertex;
				uniform mat4 u_model;
				uniform mat4 u_viewprojection;
				uniform float u_pointSize;
				void main() {
					gl_PointSize = u_pointSize;
					vec3 vertex = (u_model * vec4(a_vertex,1.0)).xyz;
					gl_Position = u_viewprojection * vec4(vertex,1.0);
				}
				`, `
				precision highp float;
				uniform vec4 u_color;
				void main() {
				  if( distance( gl_PointCoord, vec2(0.5)) > 0.5)
				     discard;
				  gl_FragColor = u_color;
				}
			`);
	gl.shaders["point"] = this._point_shader;	
	
	this._color_shader = new GL.Shader(`
		precision highp float;
		attribute vec3 a_vertex;
		attribute vec4 a_color;
		varying vec4 v_color;
		uniform vec4 u_color;
		uniform mat4 u_model;
		uniform mat4 u_viewprojection;
		void main() {
			v_color = a_color * u_color;
			vec3 vertex = (u_model * vec4(a_vertex,1.0)).xyz;
			gl_Position = u_viewprojection * vec4(vertex,1.0);
			gl_PointSize = 5.0;
		}
		`, `
		precision highp float;
		varying vec4 v_color;
		void main() {
		  gl_FragColor = v_color;
		}
	`);
	gl.shaders["color"] = this._color_shader;

	var fragment_shader = `
		precision highp float;
		varying vec2 v_coord;
		uniform vec4 u_color;
		#ifdef COLOR
		varying vec4 v_color;
		#endif
		#ifdef ALBEDO
			uniform sampler2D u_albedo_texture;
		#else
			uniform sampler2D u_color_texture;
		#endif
		uniform float u_global_alpha_clip;
		void main() {
			#ifdef ALBEDO
				vec4 color = u_color * texture2D(u_albedo_texture, v_coord);
			#else
				vec4 color = u_color * texture2D(u_color_texture, v_coord);
			#endif
			#ifdef COLOR
				color *= v_color;
			#endif
			if(color.w <= u_global_alpha_clip)
				discard;
			gl_FragColor = color;
		}
	`;
	
	gl.shaders["texture"] = this._texture_shader = new GL.Shader( vertex_shader, fragment_shader );

	var skybox_vs = `
	precision highp float;
	attribute vec3 a_vertex;
	attribute vec3 a_normal;
	attribute vec2 a_coord;
	varying vec3 v_pos;
	varying vec3 v_wPos;
	varying vec3 v_wNormal;
	varying vec2 v_coord;
	uniform mat4 u_model;
	uniform mat4 u_viewprojection;
	
	void main() {
		v_coord = a_coord;
		vec3 vertex = a_vertex;	
		v_pos = vertex;
		v_wPos = (u_model * vec4(vertex,1.0)).xyz;
		v_wNormal = (u_model * vec4(a_normal,0.0)).xyz;
		gl_Position = u_viewprojection * vec4(v_wPos,1.0);
	}
	`;
	
	var skybox_fs = `
	precision highp float;
	varying vec3 v_pos;
	varying vec3 v_wPos;
	varying vec3 v_wNormal;
	varying vec2 v_coord;
	
	uniform vec4 u_color;
	uniform samplerCube u_color_texture;
	uniform vec3 u_camera_position;
	
	void main() {
	  vec3 L = normalize(vec3(1.,1.,-1.));
	  vec3 N = normalize( v_wNormal );
		vec3 E = normalize( v_wPos - u_camera_position );
	  vec4 color = u_color;
	  color.xyz = textureCube( u_color_texture, -E * vec3(1.0,-1.0,1.0) ).xyz;
	  gl_FragColor = color;
	}
	`
	gl.shaders["skybox"] = this._skybox_shader =  new GL.Shader( skybox_vs, skybox_fs );
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
	this.stats.draw_calls += 1;
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
	this.stats.draw_calls += 1;
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
	this.stats.draw_calls += 1;
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

//encapsulates one render call, helps sorting ***********************************
class Renderable {
	name = "";
	id = -1;
	flags = 0;
	mesh = null;
	model = null;
	index_buffer_name = "triangles";
	group_index = -1;
	draw_range = null;
	material = null;
	reverse_faces = false;
	primitive = -1;
	skin = null; //could be RD.Skeleton or { bindMatrices:[], joints:[], skeleton_root }
	morphs = null; //should be [{morph,weight}]
	bounding = BBox.create();

	instances = null; //models
	node = null;
	_render_priority = 0;

	constructor()
	{
	}

	copyFrom( rc ) {
		this.name = rc.name;
		this.id = rc.id;
		this.flags = rc.flags;
		this.mesh = rc.mesh;
		this.model = rc.model;
		this.index_buffer_name = rc.index_buffer_name;
		this.group_index = rc.group_index;
		this.material = rc.material;
		this.reverse_faces = rc.reverse_faces;
		this.skin = rc.skin;
		this.draw_range = rc.draw_range;
		this.primitive = rc.primitive;
		this.instances = rc.instances;
		this.morphs = rc.morphs;
		this.bounding.set( rc.bounding );
		this._render_priority = rc._render_priority;

		this.node = rc.node;
	}

	computeRenderPriority( point )
	{
		this.name = this.node.name;
		var bb = this.mesh.getBoundingBox();
		if(!bb)
			return;
		var pos = mat4.multiplyVec3( temp_vec3, this.model, bb );
		this._render_priority = this.material.render_priority || 0;
		var dist = vec3.distance( point, pos );
		if(this.material.alphaMode == "BLEND")
		{
			this._render_priority += dist * 0.001;
			this._render_priority -= 100;
		}
		else
		{
			this._render_priority += 1000 - dist * 0.001; //sort backwards
		}
	}
}

RD.Renderable = Renderable;


class UberShader {
	name = "";
	shaders = new Map();

	vs_generator = null;
	fs_generator = null;

	constructor(vs_generator, fs_generator)
	{
		this.vs_generator = vs_generator;
		this.fs_generator = fs_generator;
	}

	replacePragmas(code, pragmas){
		for(var i in pragmas)
			code = code.replaceAll("#pragma " + i,pragmas[i]);
	}

	getShader(macros)
	{
		macros = macros || 0;
		var container = this.shaders;
		var shader = container.get( macros );
		if(shader)
			return shader;

		var vs = this.vs_generator(macros);
		var fs = this.fs_generator(macros);

		var macros_info = null;
		if( macros )
		{
			macros_info = {};
			for( var i in SHADER_MACROS )
			{
				var flag = SHADER_MACROS[i];
				if( macros & flag )
					macros_info[ i ] = "";
			}
		}

		var shader = new GL.Shader( vs, fs, macros_info );
		container.set(macros,shader);
		return shader;
	}
}

RD.UberShader = UberShader;



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
		node.fromJSON( tpl );
	if(parent)
		( parent.constructor === RD.Scene ? parent.root : parent ).addChild( node );
	if(extra_options)
		node.fromJSON(extra_options);
	return node;
}

RD.Factory.templates = {
	grid: { mesh:"grid", material: { primitive: 1, color: [0.5,0.5,0.5,0.5], blend_mode: RD.BLEND_ALPHA } },
	sphere: { mesh:"sphere" },
	floor: { mesh:"planeXZ", scaling: 10 }
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


var RENDERABLE_IGNORE_BOUNDING = 1;

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
	
	//renderer.setModelMatrix( node._global_matrix );
}

RD.makeHash = function(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (var i = 0; i < length; i++)
      result += characters.charAt((Math.random() * charactersLength)|0);
    return result;
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

//cloned methods for legacy
SceneNode.prototype.move = SceneNode.prototype.translate;
SceneNode.prototype.setRotationFromEuler = SceneNode.prototype.setEulerRotation;
SceneNode.prototype.getGlobalPoint = SceneNode.prototype.localToGlobal;
SceneNode.prototype.serialize = SceneNode.prototype.toJSON;
SceneNode.prototype.configure = SceneNode.prototype.fromJSON;
SceneNode.ctor = SceneNode.prototype._ctor; //helper
Material.prototype.configure = Material.prototype.fromJSON;
Material.prototype.serialize = Material.prototype.toJSON;
Camera.prototype.configure = Camera.prototype.fromJSON;
Camera.prototype.serialize = Camera.prototype.toJSON;


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

