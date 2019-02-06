var scene = null;

function init()
{
	//create the rendering context
	var context = GL.create({width: window.innerWidth, height:window.innerHeight});
	var renderer = new RD.Renderer(context);
	document.body.appendChild(renderer.canvas); //attach

	//create a scene
	scene = new RD.Scene();

	//get shaders from a single text file	
	renderer.loadShaders("shaders.txt");

	//folder where stuff will be loaded	(textures, meshes, shaders )
	renderer.setDataFolder("data");

	//create camera
	var camera = new RD.Camera();
	camera.perspective( 45, gl.canvas.width / gl.canvas.height, 1, 1000 );
	camera.lookAt( [100,100,100],[0,0,0],[0,1,0] );
	
	//global settings
	var bg_color = vec4.fromValues(0.1,0.1,0.1,1);

	var skybox = new RD.Skybox({texture: "blursky_CUBEMAP.png" }); //warning: name must contain "CUBEMAP"!
	scene.root.addChild( skybox );

	//add some objects to the scene
	var knight = new RD.SceneNode({
		position: [0,0,0],
		scaling: 1,
		color: [1,1,1,1],
		mesh: "knight.obj",
		texture: "knight.png",
		shader: "phong_texture"
	});
	scene.root.addChild( knight );

	var floor = new RD.SceneNode({
		position: [0,0,0],
		scaling: 100,
		color: [1,1,1,1],
		mesh: "planeXZ",
		texture: "floor.png",
		tiling: 4,
		shader: "phong_texture"
	});
	scene.root.addChild( floor );

	// main loop ***********************
	
	//main draw function
	context.ondraw = function(){
		//clear
		renderer.clear(bg_color);
		//render scene
		renderer.render(scene, camera);
	}

	var target = null;

	//main update
	context.onupdate = function(dt)
	{
		scene.update(dt);

		//move to target
		if(target)
		{
			vec3.lerp( knight.position, knight.position, target, 0.1);
			knight.updateMatrices();
		}
	}

	//user input ***********************

	//detect clicks
	context.onmouseup = function(e)
	{
		if(e.click_time < 200) //fast click
		{
			//compute collision with floor plane
			var ray = camera.getRay(e.canvasx, e.canvasy);
			if( ray.testPlane( RD.ZERO, RD.UP ) ) //collision
				target = ray.collision_point;
		}
	}
	
	context.onmousemove = function(e)
	{
		if(e.dragging)
		{
			//orbit camera around
			camera.orbit( e.deltax * -0.01, RD.UP );
			camera.position = vec3.scaleAndAdd( camera.position, camera.position, RD.UP, e.deltay );
		}
	}
	
	context.onmousewheel = function(e)
	{
		//move camera forward
		camera.position = vec3.scale( camera.position, camera.position, e.wheel < 0 ? 1.1 : 0.9 );
	}
	
	//capture mouse events
	context.captureMouse(true);

	//launch loop
	context.animate(); 

}