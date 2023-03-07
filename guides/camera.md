# Camera

When rendering environments you will need to setup the camera according to the point of view you want to render it from.

Cameras contain several properties that you can set up:

- **camera.fov**: Defines the field of view (zoom) of the camera, in degrees. 
- **camera.aspect**: Defines the aspect ration of the screen, it should be ```canvas.width / canvas.height``` unless you are rendering to a deformed viewport.
- **near and far**: Define the nearest and farthest view distance.
- **camera.position**: Assign where is the camera located in the 3D space.
- **camera.target**: Assign where is the camera pointing at.
- **camera.up**: Assign the up vector for the camera, usually [0,1,0]

The best way to set up all camera parameters is using the methods perspective and lookat:

```js
var camera = new RD.Camera();
camera.perspective( 45, gl.canvas.width / gl.canvas.height, 0.1, 1000);
camera.lookAt( [0,4,10], [0,0,0], [0,1,0] );
```

There are several methods that could help you control the camera:

```js
camera.move([10,0,0]); //to move it according to world coordinates
camera.moveLocal([10,0,0]); //to move it according to view coordinates
camera.rotate( angle, axis ); //to rotate from camera center
camera.orbit( angle, axis ); //to rotate from target center
```
