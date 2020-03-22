
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

		this.gizmo = new RD.Gizmo(); //gizmo is not added to the scene as it should be rendered after the outline

		this.object = new RD.SceneNode({color:[0.5,0.5,0.5,1],mesh:"data/monkey.obj", shader:"phong"});
		this.object.rotate(90*DEG2RAD,RD.UP);
		this.scene.root.addChild(this.object);

		gl.shaders["phong"] = new GL.Shader( this.renderer._vertex_shader, this.renderer._fragment_shader, { EXTRA: "NdotL = dot(u_light_vector,N) * 0.5 + 0.5;\n" });
		gl.shaders["phong"].uniforms(this.renderer._phong_uniforms);

		this.selected_objects = [this.object];
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

		this.renderer.render( this.scene, this.camera ); //render scene
		this.renderOutline(); //render outline
		this.renderer.render( this.scene, this.camera, [this.gizmo] ); //render gizmo on top
	},

	renderOutline: function()
	{
		if(!this.gizmo.target)
			return;
		this.selected_objects = [this.gizmo.target];
		if(!this._selection_buffer || this._selection_buffer.width != gl.canvas.width || this._selection_buffer.height != gl.canvas.height)
			this._selection_buffer = new GL.Texture( gl.canvas.width, gl.canvas.height );
		var that = this;
		this._selection_buffer.drawTo(function(){
			gl.clearColor(0,0,0,1);
			gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
			that.renderer.shader_overwrite = "flat";
			that.renderer.onNodeShaderUniforms = function(node,shader) { shader.setUniform("u_color",[1,1,1,1]); };
			that.renderer.render( that.scene, that.camera, that.selected_objects );
			that.renderer.onNodeShaderUniforms = that.renderer.shader_overwrite = null;
		});
		var outline_shader = gl.shaders["outline"];
		if(!outline_shader)
			outline_shader = gl.shaders["outline"] = GL.Shader.createFX("\
				vec4 colorUp = texture2D(u_texture, uv - vec2(0.0,u_res.y));\n\
				vec4 colorRight = texture2D(u_texture, uv - vec2(u_res.x,0.0));\n\
				color = abs( (color - colorUp) + (color - colorRight));\n\
			","uniform vec2 u_res;\n");

		gl.blendFunc(gl.ONE,gl.ONE);
		gl.enable(gl.BLEND);
		this._selection_buffer.toViewport(outline_shader, {u_res: [1/gl.canvas.width,1/gl.canvas.height]});
		gl.disable(gl.BLEND);
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
			if(click_time < 200)
			{
				var ray = this.camera.getRay(e.canvasx,e.canvasy);
				var coll = vec3.create();
				var node = this.scene.testRay(ray, coll, this.camera.far, 0xFF,true );
				if(node)
					this.gizmo.setTarget(node);
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
		if(e.code == "KeyF")
		{
			this.camera.target = this.object.getGlobalPosition();
		}
		else if(e.code == "KeyR")
		{
			this.gizmo.resetTransform();
			if(this.gizmo.target)
				this.gizmo.target.resetTransform();
		}
		
	}
};

CORE.init();