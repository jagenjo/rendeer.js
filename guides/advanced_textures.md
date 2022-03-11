# Advanced textures

Handling textures in Rendeer is quite easy.
Every texture should be stored in the global textures container ```gl.textures```(which is the same as ```renderer.textures```).

```js
//create custom texture
var tex = new GL.Texture(256,256);
//register
gl.textures["mytex"] = tex;
```

So they can be referenced by their name, for instance, from materials:
```js
  var material = new RD.Material();
  material.register("mymat");
  material.textures.color = "mytex";
```

Usually we want textures to be loaded from a regular image from the web:

```js
//loads the image and creates a texture for it
var tex = GL.Texture.fromURL("image.jpg");
```

But if we already have the image in memory, we can upload to the texture.
It is important that the image size is the same as the texture.
```js
tex.uploadImage( img );
```

We can apply the same solution for Canvas or even Videos.

```js
tex.uploadImage( video );
tex.uploadImage( canvas );
```

But keep in mind that it will upload the current content of said video/canvas.
If the content changes you must upload it again to the GPU calling the uploadImage method again.

```js
var video = document.createElement("video");
video.src = "video.webm";
video.autoplay = true;

var tex = null;


function onUpdate()
{
//...
  if(video.videoWidth) //video has size, means loaded
  {
    if(!tex)
      tex = GL.Texture.fromVideo( video );
    else
      tex.uploadImage( video );
  }
}

```

