function init()
{
	//create a scene
	var scene = new RD.Scene();

	//create the rendering context
	var context = GL.create({width: window.innerWidth, height:window.innerHeight});
	var renderer = new RD.Renderer(context);
	document.body.appendChild(renderer.canvas); //attach
	
	renderer.meshes["sphere"] = GL.Mesh.sphere({subdivisions:64});

	//get shaders for text file	
	renderer.loadShaders("shaders.txt");

	//folder where stuff will be loaded	
	renderer.setDataFolder("data");
	
	//load texture
	renderer.loadTexture("texture_sun.jpg", { wrap: gl.REPEAT, minFilter: gl.LINEAR_MIPMAP_LINEAR });

	//create camera
	var camera = new RD.Camera();
	camera.perspective( 45, gl.canvas.width / gl.canvas.height, 1, 1000 );
	camera.lookAt( [100,100,100],[0,0,0],[0,1,0] );
	
	//global settings
	var bg_color = vec4.fromValues(0.1,0.1,0.1,1);

	//create a mesh in the scene
	var node = new RD.SceneNode();
	node.position = [0,0,0];
	node.color = [1,1,1,1];
	node.mesh = "sphere";
	node.shader = "sun";
	node.texture = "texture_sun.jpg";
	node.scale([50,50,50]);
	node.uniforms["u_bgcolor"] = bg_color;
	scene.root.addChild(node);
	
	context.ondraw = function(){
		renderer.clear(bg_color);
		renderer.render(scene, camera);
	}
	
	context.onupdate = function(dt)
	{
		scene.update(dt);
	}
	
	context.animate(); //launch loop
	
	//user input
	context.onmousemove = function(e)
	{
		if(e.dragging)
		{
			camera.position = vec3.scaleAndAdd( camera.position, camera.position, RD.UP, e.deltay );
			node.rotate( e.deltax * 0.01, RD.UP );
		}
	}
	
	context.onmousewheel = function(e)
	{
		camera.position = vec3.scale( camera.position, camera.position, e.wheel < 0 ? 1.1 : 0.9 );
	}
	
	context.captureMouse(true);
}