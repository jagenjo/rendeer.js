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
	camera.lookAt( [0,100,100],[0,0,0],[0,1,0] );
	
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

	var sprite = new RD.Sprite({
		position: [0,0,0],
		size: [16,32],
		sprite_pivot: RD.BOTTOM_CENTER,
		texture: "javi-spritesheet.png",
		frame: 0
	});
	sprite.flags.pixelated = true;
	sprite.createFrames([16,4]);
	scene.root.addChild( sprite );


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

		var now = getTime() * 0.001;
		var frames = [2,3,4,5,6,7,8,9];
		var dist = 0;
		if( target )
			dist = vec3.distance(sprite.position,target);

		if(dist > 1)
			sprite.frame = frames[ Math.floor(now*15) % frames.length ];
		else
		{
			dist = 0;
			sprite.frame = 0;
			target = null;
		}

		//move to target
		if(dist)
		{
			var delta = vec3.sub( vec3.create(), target, sprite.position );
			vec3.normalize(delta,delta);
			vec3.scaleAndAdd( sprite.position, sprite.position, delta, dt * 50 );
			sprite.updateMatrices();
			sprite.flags.flipX = delta[0] < 0;
		}

		if(target == null && Math.floor(now)%10 == 0)
			target = [Math.random()*50-25,0,Math.random()*50-25];
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