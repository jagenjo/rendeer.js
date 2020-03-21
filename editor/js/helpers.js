(function(global){

function Gizmo(o)
{
	this._ctor();
	if(o)
		this.configure(o);
	this.render_priority = 0;
	this.target = null;
	this.size = 150; //in pixels

	this._last = vec3.create();

	var actions = ["drag","movex","movey","movez","scalex","scaley","scalez","rotatex","rotatey","rotatez","rotatefront","rotate"];
	this.actions = {};
	for(var i in actions)
	{
		var action = actions[i];
		var info = {
			mask: 0xFF,
			pos: vec3.create(),
			pos2D: vec3.create(),
			radius: 0.2
		};
		if(action.indexOf("move") == 0)
			info.move = true;
		if(action.indexOf("rotate") == 0)
			info.rotate = true;
		if(action.indexOf("scale") == 0)
			info.scale = true;
		this.actions[ action ] = info;		
	}

	this.actions["scalex"].axis = this.actions["rotatex"].axis = this.actions["movex"].axis = vec3.fromValues(1,0,0);
	this.actions["scaley"].axis = this.actions["rotatey"].axis = this.actions["movey"].axis = vec3.fromValues(0,1,0);
	this.actions["scalez"].axis = this.actions["rotatez"].axis = this.actions["movez"].axis = vec3.fromValues(0,0,1);

	this.click_model = mat4.create();
	this.click_transform = new Float32Array(10);
	this.click_2D = vec3.create();
	this.click_2D2 = vec3.create();
	this.click_2D_norm = vec3.create();
	this.center_2D = vec3.create();
	this.click_dist = 1;
}

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


var tmp = mat4.create();
var tmp2 = mat4.create();

Gizmo.XAXIS_COLOR = [0.901, 0.247, 0.349,1];
Gizmo.YAXIS_COLOR = [0.55, 0.81, 0.11,1];
Gizmo.ZAXIS_COLOR = [0.23, 0.57, 0.93,1];
Gizmo.SPHERE_COLOR = [0.1,0.1,0.1,0.5];
Gizmo.RING_COLOR = [0.5,0.5,0.5,1];
Gizmo.INNERSPHERE_COLOR = [0.6,0.6,0.6,1];
Gizmo.SELECTED_COLOR = [1,1,1,1];

Gizmo.prototype.toScreen = function( m, action )
{
	var info = this.actions[action];
	mat4.multiplyVec3( info.pos, m, [0,0,0] );
	this._camera.project( info.pos, null, info.pos2D );
}

Gizmo.prototype.setTarget = function( node )
{
	this.target = node;
	this.transform = node.transform;
}

Gizmo.prototype.updateTarget = function( node )
{
	if(!this.target)
		return;
	this.target.transform = this.transform;
}

Gizmo.prototype.render = function(renderer,camera)
{
	if(!gl.meshes["cone"])
	{
		gl.meshes["cylinder"] = GL.Mesh.cylinder({radius:0.02,height:1});
		gl.meshes["cone"] = GL.Mesh.cone({radius:0.1,height:0.25});
		gl.meshes["torus"] = GL.Mesh.torus({outerradius:1,innerradius:0.02,outerslices:64,innerslices:8});
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

	this._camera = camera;
	this._unitary_model = model;
	var hover = this._hover_action;
	var selected = this._selected_action;
	if(selected)
		hover = selected;

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
	mat4.scale( model, model, [s,s,s] );
	mat4.scale( model_aligned, model_aligned, [s,s,s] );

	var dotx = vec3.dot(camfront,right);
	var doty = vec3.dot(camfront,up);
	var dotz = vec3.dot(camfront,front);

	this._camera.project( position, null, this.center_2D );

	gl.disable(gl.DEPTH_TEST);
	gl.disable(gl.BLEND);
	gl.disable(gl.CULL_FACE);

	var shader = gl.shaders["flat"];
	shader.uniforms(renderer.uniforms);
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


	//sphere
	if(hover == "rotate")
	{
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		mat4.scale( tmp, model, [0.9,0.9,0.9] );
		shader.setUniform("u_model",tmp);
		shader.setUniform("u_color",Gizmo.SPHERE_COLOR);
		shader.draw( sphere );
		gl.disable(gl.BLEND);
	}

	//ring
	mat4.rotateX(tmp, model_aligned, Math.PI/2 );
	shader.setUniform("u_model",tmp);
	shader.setUniform("u_color", hover == "rotatefront" ? Gizmo.SELECTED_COLOR : Gizmo.RING_COLOR );
	shader.draw( torus );

	/*
	//rotator X
	if( Math.abs(dotx) > 0.1)
	{
		mat4.rotateZ(tmp, model, Math.PI/2 );
		shader.setUniform("u_model",tmp);
		shader.setUniform("u_color",Gizmo.XAXIS_COLOR);
		shader.draw( halftorus );
	}

	//rotator Y
	if( Math.abs(doty) > 0.1)
	{
		shader.setUniform("u_model",model);
		shader.setUniform("u_color",Gizmo.YAXIS_COLOR);
		shader.draw( halftorus );
	}

	//rotator Z
	if( Math.abs(dotz) > 0.1)
	{
		mat4.rotateX(tmp, model, Math.PI/2 );
		shader.setUniform("u_model",tmp);
		shader.setUniform("u_color",Gizmo.ZAXIS_COLOR);
		shader.draw( halftorus );
	}
	*/

	//translate X
	if( Math.abs(dotx) < 0.95)
	{
		mat4.rotateZ( tmp, model, dotx < 0  ? -Math.PI / 2 : Math.PI / 2 );
		this.drawArrow( tmp, hover == "movex" ? Gizmo.SELECTED_COLOR : Gizmo.XAXIS_COLOR, "movex" );
		this.drawScale( tmp, hover == "scalex" ? Gizmo.SELECTED_COLOR : Gizmo.XAXIS_COLOR, "scalex" );
	}

	//translate Y
	if( Math.abs(doty) < 0.95)
	{
		if(doty > 0)
			mat4.rotateZ( tmp, model, Math.PI );
		else
			tmp.set(model);
		this.drawArrow( tmp, hover == "movey" ? Gizmo.SELECTED_COLOR : Gizmo.YAXIS_COLOR, "movey" );
		this.drawScale( tmp, hover == "scaley" ? Gizmo.SELECTED_COLOR : Gizmo.YAXIS_COLOR, "scaley" );
	}

	//translate Z
	if( Math.abs(dotz) < 0.95)
	{
		mat4.rotateX( tmp, model, dotz < 0 ? -Math.PI / 2 : Math.PI / 2 );
		this.drawArrow( tmp, hover == "movez" ? Gizmo.SELECTED_COLOR : Gizmo.ZAXIS_COLOR, "movez" );
		this.drawScale( tmp, hover == "scalez" ? Gizmo.SELECTED_COLOR : Gizmo.ZAXIS_COLOR, "scalez" );
	}

	//inner sphere
	this.drawInnerSphere(model);

	gl.enable(gl.DEPTH_TEST);
}

Gizmo.prototype.drawArrow = function(model,color,action)
{
	var shader = gl.shaders["flat"];
	var cone = gl.meshes["cone"];
	var cylinder = gl.meshes["cylinder"];
	var hover = this._hover_action;
	mat4.translate( tmp2, model, [0,1.1,0] );
	shader.setUniform("u_model",tmp2);
	shader.setUniform("u_color", hover == action ? Gizmo.SELECTED_COLOR : color);//Gizmo.XAXIS_COLOR);
	shader.draw( cone );

	mat4.translate( tmp2, tmp2, [0,-0.15,0] );
	mat4.scale( tmp2, tmp2, [1,0.5,1] );
	shader.setUniform("u_model",tmp2);
	shader.draw( cylinder );

	this.toScreen(tmp2,action);
}

Gizmo.prototype.drawAxis = function(model,color)
{
	var shader = gl.shaders["flat"];
	var cylinder = gl.meshes["cylinder"];
	mat4.scale( tmp2, model, [0.5,100,0.5] );
	shader.setUniform("u_color",color);
	shader.setUniform("u_model",tmp2 );
	gl.enable(gl.DEPTH_TEST);
	shader.draw( cylinder );
	//shader.draw( cylinder );
	gl.disable(gl.DEPTH_TEST);
	this.drawInnerSphere(model);
}

Gizmo.prototype.drawScale = function(model,color,action)
{
	var cylinder = gl.meshes["cylinder"];
	var sphere = gl.meshes["sphere"];

	var shader = gl.shaders["flat"];
	shader.setUniform("u_color",color);

	mat4.translate( tmp, model, [0,0.25,0] );
	mat4.scale( tmp, tmp, [1,0.5,1] );
	shader.setUniform("u_model",tmp);
	shader.draw( cylinder );

	mat4.translate( tmp, model, [0,0.4,0] );
	mat4.scale( tmp, tmp, [0.1,0.2,0.1] );
	shader.setUniform("u_model",tmp);
	shader.draw( sphere );


	this.toScreen(tmp,action);
}



Gizmo.prototype.drawInnerSphere = function(model)
{
	var shader = gl.shaders["flat"];
	var sphere = gl.meshes["sphere"];
	var hover = this._hover_action;
	mat4.scale( tmp, model, [0.1,0.1,0.1] );
	shader.setUniform("u_model", tmp);
	shader.setUniform("u_color", hover == "drag" ? Gizmo.SELECTED_COLOR :Gizmo.INNERSPHERE_COLOR);
	shader.draw( sphere );
	mat4.scale( tmp, model, [0.07,0.07,0.07] );
	shader.setUniform("u_model",tmp);
	shader.setUniform("u_color", hover == "drag" ? Gizmo.INNERSPHERE_COLOR : [0,0,0,1]);
	shader.draw( sphere );
	this.toScreen(tmp,"drag");
}

Gizmo.prototype.onMouse = function(e)
{
	if(!this._camera)
		return;

	var front = this._camera.getFront();
	var ray = this._camera.getRay(e.canvasx, e.canvasy);
	var center = this.position;
	var action = this._selected_action;
	var action_info = this.actions[action];
	var model = this._global_matrix;
	var center2D = this.actions["drag"].pos2D;
	var mouse = [e.canvasx, e.canvasy];

	if(e.type == "mousedown")
	{
		this.click_2D[0] = this.click_2D2[0] = e.canvasx;
		this.click_2D[1] = this.click_2D2[0] = e.canvasy;

		action = this._selected_action = this._hover_action;
		action_info = this.actions[action];
		if(action_info)
		{
			//compute axis
			if( action_info.move )
			{
				var axis = vec3.clone(action_info.axis);
				mat4.rotateVec3(axis,model,axis);
				vec3.normalize(axis,axis);
				this._last = ray.closestPointOnRay( center, axis );
				if(e.shiftKey)
				{
					var n = this.target.clone();
					this.target.parentNode.addChild(n);
					this.target = n;
				}
			}
			if( action == "drag")
			{
				ray.testPlane( center, this._camera.getFront() );
				this._last = ray.collision_point;
				if(e.shiftKey)
				{
					var n = this.target.clone();
					this.target.parentNode.addChild(n);
					this.target = n;
				}
			}
			if( action == "rotatefront")
			{
				vec2.sub(this.click_2D,this.click_2D,center2D);
				vec2.normalize(this.click_2D,this.click_2D);
				this.click_2D_norm.set( this.click_2D );
				vec2.scaleAndAdd(this.click_2D,center2D,this.click_2D,this.size*0.5);
			}
			if( action == "rotate")
			{
				if ( ray.testSphere( center, this.size*0.5 ) )
				{
					this.click_2D.norm
				}
				vec2.sub(this.click_2D,this.click_2D,center2D);
				vec2.normalize(this.click_2D,this.click_2D);
				this.click_2D_norm.set( this.click_2D );
				vec2.scaleAndAdd(this.click_2D,center2D,this.click_2D,this.size*0.5);
			}
			this.click_model.set( model );
			this.click_transform.set( this.transform );
			this.click_dist = vec3.distance( action_info.pos, center );
		}
	}
	else if(e.type == "mousemove")
	{
		if(e.dragging && this._selected_action)
		{
			if( action == "rotatefront")
			{
				var v = vec2.sub(vec3.create(),mouse,center2D);
				vec2.normalize(v,v);
				var v2 = this.click_2D_norm;
				vec2.scaleAndAdd( this.click_2D2, center2D, v, this.size * 0.5 );
				var angle1 = Math.atan2(v[0],v[1]);
				var angle2 = Math.atan2(v2[0],v2[1]);
				var angle = angle1 - angle2;
				if(angle)
				{
					this.transform.set( this.click_transform );
					this.rotate( angle, front, true );
				}
				if(this.target)
					this.target.rotation = this.rotation;

				//this.updateMatrices();
				//if(this.target)
				//	this.target.fromMatrix( this.getGlobalMatrix(), true);
				return true;
			}
			var diff = null;
			if( action_info.move || action_info.scale )
			{
				var axis = vec3.clone(action_info.axis);
				mat4.rotateVec3(axis,model,axis);
				vec3.normalize(axis,axis);
				var closest = ray.closestPointOnRay( center, axis );
				if(action_info.scale)
				{
					var dist = vec3.distance( closest, center );
					var ratio = dist / this.click_dist;
					if(action == "scalex")
						this.target._scale[0] *= ratio;
					else if(action == "scaley")
						this.target._scale[1] *= ratio;
					else if(action == "scalez")
						this.target._scale[2] *= ratio;
					this.click_dist = dist;
					this.target.updateMatrices();
					return true;
				}
				diff = vec3.sub( vec3.create(), closest, this._last );
				this._last = closest;
			}
			if( action == "drag")
			{
				var closest = ray.testPlane( center, this._camera.getFront() );
				var closest = ray.collision_point;
				diff = vec3.sub( vec3.create(), closest, this._last );
				this._last = closest;
			}

			if(diff)
			{
				this.translate(diff);
				this.updateMatrices();
				if(this.target)
					this.target.position = this.position;
				return true;
			}
		}
		else
		{
			this._hover_action = null;
			var mouse = [e.canvasx,e.canvasy];
			var mindist = 100000;
			var hover = null;
			var center2D = this.actions["drag"].pos2D;
			for(var i in this.actions)
			{
				var info = this.actions[i];
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
				var disttocenter = vec2.distance( center2D, mouse );
				if( Math.abs(disttocenter - this.size*0.5) < 10 ) //border
					hover = "rotatefront";
				else if( disttocenter <  this.size*0.5 )
					hover = "rotate";
			}
			this._hover_action = hover;
		}
	}
	else if(e.type == "mouseup")
	{
		this._selected_action = null;
	}

	return false;
}

extendClass( Gizmo, RD.SceneNode );
RD.Gizmo = Gizmo;


})(this);