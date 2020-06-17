
var CORE = {
	scene: null,
	camera: null,
	renderer: null,

	init: function()
	{
		GUI.init();

		var context = GL.create({canvas: GUI.canvas});
		var renderer = this.renderer = new RD.Renderer(context);
		context.captureMouse(true);
		renderer.context.onmouse = this.onMouse.bind(this);
		renderer.context.onmousewheel = this.onMouseWheel.bind(this);
		renderer.sort_by_priority = true;

		context.captureKeys();
		renderer.context.onkey = this.onKey.bind(this);
		renderer.context.ondraw = this.render.bind(this);
		renderer.context.onupdate = this.update.bind(this);

		context.animate();

		this.camera = new RD.Camera();
		this.camera.perspective(60,gl.canvas.width/gl.canvas.height,0.1,1000);
		this.camera.lookAt([0,10,10],[0,0,0],[0,1,0]);
		this.scene = new RD.Scene();

		this.grid = RD.Factory("grid");
		this.grid.layers = 1<<7;
		this.scene.root.addChild(this.grid);

		this.gizmo = new RD.Gizmo(); //gizmo is not added to the scene as it should be rendered after the outline
		this.gizmo.layers = 0x7F; //only affects layers 1 and 2

		this.object = new RD.SceneNode({color:[0.6,0.5,0.5,1],mesh:"data/monkey.obj", shader:"phong"});
		//this.object.rotate(90*DEG2RAD,RD.RIGHT);
		this.scene.root.addChild(this.object);

		this.objectb = new RD.SceneNode({color:[0.6,0.5,0.5,1],mesh:"data/monkey.obj", shader:"phong"});
		this.objectb.position = [0,1,0];
		this.objectb.scale(0.2);
		this.object.addChild(this.objectb);

		this.object2 = new RD.SceneNode({ position:[4,0,0], color:[0.5,0.6,0.5,1],mesh:"data/monkey.obj", shader:"phong"});
		this.object2.rotate(-90*DEG2RAD,RD.UP);
		this.scene.root.addChild(this.object2);

		gl.shaders["phong"] = new GL.Shader( this.renderer._vertex_shader, this.renderer._fragment_shader, { EXTRA: "NdotL = dot(u_light_vector,N) * 0.5 + 0.5;\n" });
		gl.shaders["phong"].uniforms(this.renderer._phong_uniforms);

		this.gizmo.setTargets( [this.object,this.object2] );
	},

	render: function()
	{
		var rect = gl.canvas.parentNode.getBoundingClientRect();
		gl.canvas.width = rect.width;
		gl.canvas.height = rect.height;
		this.camera.aspect = rect.width / rect.height;
		this.camera.updateMatrices();
		gl.viewport(0,0,gl.canvas.width,gl.canvas.height);

		gl.clearColor(0.1,0.1,0.1,1);
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
		gl.enable(gl.BLEND);

		this.renderer.render( this.scene, this.camera, null ); //render scene
		this.gizmo.renderOutline(this.renderer, this.scene, this.camera); //render outline
		this.renderer.render( this.scene, this.camera, [this.gizmo] ); //render gizmo on top
	},

	update: function(dt)
	{
	},
	
	onMouse: function(e)
	{
		if(e.type == "mousedown")
			this.last_click_time = getTime();
		var prev_pos = null;
		//if(e.type == "mouseup")
		//	document.exitPointerLock();

		if(e.ctrlKey)
		{
			prev_pos = vec3.clone(this.gizmo.position);
			//if(e.type == "mousedown")
			//	document.body.requestPointerLock();
		}
		if(this.gizmo.onMouse(e))
		{
			if(e.ctrlKey && prev_pos)
			{
				var diff = vec3.sub(vec3.create(),this.gizmo.position,prev_pos);
				this.camera.move(diff);
				vec3.add( this.gizmo._last,this.gizmo._last,diff);
			}
			return;
		}

		if(e.type == "mousemove")
		{
			if(e.dragging)
			{
				if(e.buttons & 1)
				{
					this.camera.orbit(e.deltax * -0.005,RD.UP);
					this.camera.orbit(e.deltay * -0.005,RD.RIGHT,null,true);
				}
				else if(e.buttons & 4)
				{
					var dist = vec3.distance( this.camera.position, this.camera.target );
					var d = dist / 1000.0;
					this.camera.moveLocal([e.deltax * -d,e.deltay * d,0]);
				}
			}
		}
		else if(e.type == "mouseup")
		{
			var click_time = getTime() - this.last_click_time;
			if(click_time < 200) //if fast click
			{
				//search objects intersecting the ray
				var ray = this.camera.getRay(e.canvasx,e.canvasy);
				var coll = vec3.create();
				var node = this.scene.testRay(ray, coll, this.camera.far, 0xFF,true );
				this.gizmo.setTargets(node ? [node] : null, e.shiftKey);
			}
		}
	},

	onMouseWheel: function(e)
	{
		var prev_pos = vec3.clone(this.gizmo.position);
		if(this.gizmo.onMouse(e))
		{
			if(e.ctrlKey)
			{
				var diff = vec3.sub(vec3.create(),this.gizmo.position,prev_pos);
				this.camera.move(diff);
				vec3.add( this.gizmo._last,this.gizmo._last,diff);
			}
			return;
		}
		this.camera.orbitDistanceFactor(1 + e.wheel * -0.001);
	},

	onKey: function(e)
	{
		if(e.code == "KeyF") //center on object
		{
			var diff = vec3.sub( vec3.create(), this.gizmo.computeCenter(), this.camera.target );
			this.camera.move(diff);
		}
		else if(e.code == "Escape")
		{
			this.gizmo.cancel();
		}
		else if(e.code == "KeyG")
		{
			this.gizmo.mode = RD.Gizmo.MOVEALL;
		}
		else if(e.code == "KeyR")
		{
			this.gizmo.mode = RD.Gizmo.ROTATEALL;
		}
		else if(e.code == "KeyA")
		{
			if(e.ctrlKey)
			{
				this.gizmo.setTargets(CORE.scene._nodes);
			}
		}
		else if(e.code == "KeyS")
		{
			this.gizmo.mode = RD.Gizmo.SCALEALL;
		}
		else if(e.code == "KeyD")
		{
			this.gizmo.mode = RD.Gizmo.ALL;
		}
		else if(e.code == "Home")
		{
			this.gizmo.resetTransform();
			this.gizmo.updateTargets();
		}
		else if(e.code == "Delete")
		{
			this.gizmo.removeTargetsFromScene();
		}
		
	}
};

CORE.init();