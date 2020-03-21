
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
		this.scene.root.addChild(this.grid);

		this.gizmo = new RD.Gizmo();
		this.scene.root.addChild(this.gizmo);

		this.object = new RD.SceneNode({color:[0.5,0.5,0.5,1],mesh:"data/monkey.obj", shader:"phong"});
		this.object.rotate(90*DEG2RAD,RD.UP);
		this.scene.root.addChild(this.object);

		this.gizmo.setTarget( this.object );
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

		this.renderer.render( this.scene, this.camera );
	},

	update: function(dt)
	{
	},
	
	onMouse: function(e)
	{
		if(this.gizmo.onMouse(e))
			return;

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
	},

	onMouseWheel: function(e)
	{
		this.camera.orbitDistanceFactor(1 + e.wheel * -0.001);
	},

	onKey: function(e)
	{
		if(e.code == "KeyF")
		{
			this.camera.target = this.object.getGlobalPosition();
		}
		else if(e.code == "KeyR")
		{
			this.gizmo.resetTransform();
			this.gizmo.updateTarget();
		}
		
	}
};

CORE.init();