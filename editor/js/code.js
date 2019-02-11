
var CORE = {


	init: function()
	{
		GUI.init();

		var context = GL.create({canvas: GUI.canvas});
		var renderer = new RD.Renderer(context);
		context.captureMouse();
		renderer.context.onmousedown = this.onMouseDown.bind(this);
		renderer.context.onmousemove = this.onMouseMove.bind(this);

		context.captureKeys();
		renderer.context.onkey = this.onKey.bind(this);
		renderer.context.ondraw = this.render.bind(this);
		renderer.context.onupdate = this.update.bind(this);

		context.animate();
	},

	render: function()
	{
		gl.clearColor(1,0,0,1);
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
	},

	update: function(dt)
	{
	},
	
	onMouseDown: function(e)
	{
	},

	onMouseMove: function(e)
	{
	},

	onKey: function(e)
	{
	}
};

CORE.init();