# Animations

Rendeer has a simple skeletal animations system, that allows characters to be animated.

To animate characters the mesh should contain skin information, so OBJ is not a valid format for meshes.

Rendeer supports two propietary formats for skinned meshes, .MESH (ASCII) and .WBIN (Binary).

Also for skeletal animation it uses its own propieratry format called .SKANIM (ASCII)

## Export animations

To export into Rendeer animated formats you may need to use the converter tool that converts collada files (DAE) into MESH/WBIN and SKANIM/ABIN.
MESH and SKANIM formats are ASCII Formats, while WBIN and ABIN are binary formats (less space, faster to parse).

You can find [it in this link](https://tamats.com/projects/character_creator/), drag the files there and export them from the menus.

Or you can integrate it in your system using the [collada.js](https://github.com/jagenjo/collada.js) library, and calling the RD.AnimatedCharacterFromScene function.

There is also the possibility of loading them from GLTF:
```js
var that = this;
RD.GLTF.load( url, inner );
function inner(node,filename)
{
	var info = RD.AnimatedCharacterFromScene( node, filename, true );
	//info contains mesh and animation
}
```

## RD.Skeleton

The Skeleton class contains information about a body pose.
It stores the hierarchy of the skeleton (which bone is attached to which bone) and its current orientation relative to its parent.

You can create a skeleton like this:

```js
var skeleton = new RD.Skeleton();
``` 

Although you do not need it as ```RD.SkeletalAnimation``` already contains a skeleton.

You may want to create skeletons as a container for interpolated poses from different animations, for animation blending;

## RD.SkeletalAnimation

The SkeletalAnimation class contains every pose of the skeleton along time.

You can create one like this:

```js
var anim = new RD.SkeletalAnimation();
``` 

And load from a SKAnim or ABIN file like this:
```js
anim.load( "data/idle.skanim", callback );
``` 

You can check its duration reading the ```anim.duration``` property, if duration is 0 that means it is not loaded yet.

Now to change the skeleton pose you must call the assignTime:

```js
anim.assignTime( t, true ); //pose according to time and loop
``` 

After calling this function the ```anim.skeleton``` will be in the appropiate pose.

## Using animations

First  you need to be sure that your character uses a mesh that has skinning info.

```js
var character = new RD.SceneNode();
character.name = "girl";
character.mesh = "data/girl.wbin";
scene.root.addChild( character );
```

If you are using custom shaders, remember to assign a shader that supports skinning.

Then load some animation:
```js
var anim = new RD.SkeletalAnimation();
anim.load("data/idle.skanim");
```

Set the animation skeleton in a pose based on time:
```js
if(anim.duration)
{
	var t = getTime() * 0.001; //get time in seconds
	anim.assignTime( t, true ); //pose according to time and loop
}
```

Assign animation skeleton to character:
```js
character.skeleton = anim.skeleton;
```

Keep in mind that if you modify ```anim.skeleton``` that will affect every character using that skeleton.
If you want to have independent skeletons then use ;
```js
character.assignSkeleton( anim.skeleton );
```
or clone the skeleton if you already have one in the node:
```js
character.skeleton.copyFrom( anim.skeleton );
```

## Blending

You can blend between two animations using RD.Skeleton.blend:

```js
var final_skeleton = new RD.Skeleton();
RD.Skeleton.blend( anim1.skeleton, anim2.skeleton, 0.5, final_skeleton);
```




