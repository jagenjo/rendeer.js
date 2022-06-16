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

	this.onActionFinished = null; //called on mouseup
	this.onDuplicateTargets = null; //called when user shift + drags

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
Gizmo.RESIZE = 1<<19;

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
		this.scaling = [1,1,1]; //remove scaling
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
		if(n.parentNode && isParentSelected(n.parentNode))
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

Gizmo.prototype.applyTransformToTarget = function( transmat, local_space )
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

		//precompute winding
		scaling_sign[0] = n.scaling[0] >= 0 ? 1 : -1;
		scaling_sign[1] = n.scaling[1] >= 0 ? 1 : -1;
		scaling_sign[2] = n.scaling[2] >= 0 ? 1 : -1;

		//apply transform
		if( local_space )
		{
			mat4.multiply(m,transmat,n.matrix);
			n.fromMatrix(m);
		}
		else
		{
			n.getGlobalMatrix(m); //get global node model
			if( this.coordinates == Gizmo.WORLD_SPACE )
				mat4.multiply(m,igm,m); //transform to local of gizmo
			mat4.multiply(m,transmat,m); //apply trans
			if( this.coordinates == Gizmo.WORLD_SPACE )
				mat4.multiply(m,gm,m);//back to world
			n.fromMatrix(m,true);//pass as world (to avoid substracting the parent)
		}

		//other stuff: snap, fix winding
		vec3.mul( n._scale, n._scale, scaling_sign ); //in case it was flipped in one axis
		n.position = this.applySnap( n.position );
		if(this.grid_size && 1) //snap
		{
			var euler = quat.toEuler( vec3.create(), n.rotation );
			euler[0] = (Math.round((euler[0] * RAD2DEG) / 15) * 15) * DEG2RAD;
			euler[1] = (Math.round((euler[1] * RAD2DEG) / 15) * 15) * DEG2RAD;
			euler[2] = (Math.round((euler[2] * RAD2DEG) / 15) * 15) * DEG2RAD;
			quat.fromEuler(n.rotation,euler);
			quat.normalize( n.rotation, n.rotation );
		}
		//console.log("result",n.position);
	}

	//update gizmo transform
	mat4.multiply(m,gm,transmat);//back to world
	this.fromMatrix(m);
	this.scaling = [1,1,1];
	this.updateGizmo();
}

Gizmo.prototype.applyTranslation = function(d, local_space)
{
	var transmat = mat4.create();
	mat4.translate( transmat, transmat, d );
	this.applyTransformToTarget( transmat, local_space );
}

Gizmo.prototype.applyRotation = function(angle, axis, center)
{
	var M = mat4.create();
	if(!center)
		mat4.rotate(M,M, angle, axis );
	else
	{
		var T = mat4.create();
		//console.log(center,angle);
		mat4.setTranslation(T,center);
		mat4.mul( M, M, T );
		mat4.rotate(M,M, angle, axis );
		mat4.setTranslation(T,[-center[0],-center[1],-center[2]]);
		mat4.mul( M, M, T );
	}
	this.applyTransformToTarget(M);
}

Gizmo.prototype.applyScale = function(s, local_space)
{
	if(s.constructor === Number)
		s = [s,s,s];
	var transmat = mat4.create();
	mat4.scale(transmat,transmat,s);
	this.applyTransformToTarget(transmat, local_space);
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
	//convert to local space
	var invmodel = mat4.invert(mat4.create(),model);
	var in_object_space = this.coordinates == Gizmo.OBJECT_SPACE;

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
				mat4.rotateVec3(axis,model,axis); //need axis in world space to find closest point
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

					if( this.coordinates == Gizmo.OBJECT_SPACE )
					{
						mat4.rotateVec3(diff,invmodel,diff);
						this.applyTranslation(diff, true);
						return true;
					}
				}
			}
			else if( (action_info.move || action_info.scale) ) //axis move and scale
			{
				//find closest point to axis
				var closest = null;
				if( action_info.axis )
				{
					var axis = vec3.clone(action_info.axis);
					mat4.rotateVec3(axis,model,axis);
					vec3.normalize(axis,axis);
					closest = ray.closestPointOnRay( center, axis );
				}

				if(action == "scale" || (action_info.scale && e.ctrlKey) )
				{
					var f = (1 + (mouse[1] - this.click_2D[1]) * 0.01 );
					this.applyScale(f, in_object_space);
					this.click_2D[0] = mouse[0];
					this.click_2D[1] = mouse[1];
					return true;
				}

				if(action == "scalexy" || action == "scalexz" || action == "scaleyz")
				{
					var f = (1 + (mouse[1] - this.click_2D[1]) * 0.01 );
					switch(action)
					{
						case "scalexy": this.applyScale([f,f,1],in_object_space); break;
						case "scaleyz": this.applyScale([1,f,f],in_object_space); break;
						case "scalexz": this.applyScale([f,1,f],in_object_space); break;
					}

					this.click_2D[0] = mouse[0];
					this.click_2D[1] = mouse[1];
					return true;
				}

				if(action_info.scale)
				{
					//var dist = vec3.distance( closest, center );
					var dist = vec2.distance( mouse, this.center_2D );
					var ratio = dist / this.click_dist;
					if(action == "scalex")
						this.applyScale([ratio,1,1],in_object_space); //this.target._scale[0] *= ratio;
					else if(action == "scaley")
						this.applyScale([1,ratio,1],in_object_space); //this.target._scale[1] *= ratio;
					else if(action == "scalez")
						this.applyScale([1,1,ratio],in_object_space); //this.target._scale[2] *= ratio;
					this.click_dist = dist;
					//this.target.updateMatrices();
					return true;
				}

				if( action_info.move )
				{
					if(in_object_space)
					{
						diff = vec3.sub( vec3.create(), closest, this._last );
						this._last.set( closest );
						/*
						var dist = vec3.length( diff );
						//get only rotation
						mat4.rotateVec3(diff,invmodel,diff);
						vec3.normalize( diff, diff );
						vec3.scale( diff, diff, dist );
						if( Math.abs(diff[0]) > Math.abs(diff[1]) && Math.abs(diff[0]) > Math.abs(diff[2]))
							diff[1] = diff[2] = 0;
						else if( Math.abs(diff[1]) > Math.abs(diff[2]) )
							diff[0] = diff[2] = 0;
						else
							diff[0] = diff[1] = 0;
						this.applyTranslation(diff, true)//, this.coordinates == Gizmo.OBJECT_SPACE);
						return true;
						*/
					}
					else
					{
						this.applySnap(closest);
						diff = vec3.sub( vec3.create(), closest, this._last );
						this._last.set( closest );
					}
				}

			}//move or scale

			if( action == "drag")
			{
				var closest = ray.testPlane( center, this._camera.getFront() );
				var closest = ray.collision_point;
				this.applySnap(closest);
				diff = vec3.sub( vec3.create(), closest, this._last );
				this._last = closest;
			}

			if(diff) //in world coordinates
			{
				this.applyTranslation(diff)//, this.coordinates == Gizmo.OBJECT_SPACE);
				return true;
			}
		}
		else //moving the mouse without click
		{
			this.testMouseOver(e);
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

	//separated to avoid problems with mouseup missing
	if(e.type == "mouseup" || (this._selected_action && e.buttons == 0) )
	{
		this.saveTargetTransforms();
		if(this._selected_action)
		{
			this._selected_action = null;
			this.render( this._last_renderer, this._last_camera ); //update gizmo positions
			this.testMouseOver(e);
			this.updateGizmo();
			if(this.onActionFinished)
				this.onActionFinished();
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
		gl.meshes["cube"] = GL.Mesh.cube({size:1});
		gl.meshes["circle"] = GL.Mesh.circle({radius:1});
		gl.meshes["cylinder"] = GL.Mesh.cylinder({radius:0.02,height:1});
		gl.meshes["cone"] = GL.Mesh.cone({radius:0.1,height:0.25});
		gl.meshes["torus"] = GL.Mesh.torus({outerradius:1,innerradius:0.02,outerslices:64,innerslices:8});
		gl.meshes["quartertorus"] = GL.Mesh.torus({angle:Math.PI*0.5,outerradius:1,innerradius:0.02,outerslices:64,innerslices:8});
		gl.meshes["halftorus"] = GL.Mesh.torus({angle:Math.PI,outerradius:1,innerradius:0.02,outerslices:64,innerslices:8});
	}
	var cube = gl.meshes["cube"];
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

	if( mode & Gizmo.RESIZE )
	{
		this.drawResize(model,"resize");
	}


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

Gizmo.prototype.drawResize = function(model, action)
{
	var shader = gl.shaders[this.shader];
	var cube = gl.meshes["cube"];
	var hover = this._hover_action;

	var bounding = null;
	//TODO...
}

Gizmo.prototype.computeBounding = function(out)
{
	out = out || BBox.create();

	for(var i = 0; i < this.targets.length; ++i)
	{
		var node = this.targets[i];
		var bbox = node.updateBoundingBox();
		if( i == 0 )
			BBox.copy( out, bbox );
		else			
			BBox.merge( out, out, bbox );
	}
	return out;
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