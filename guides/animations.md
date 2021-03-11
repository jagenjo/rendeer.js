# Animations

Rendeer has a simple skeletal animations system, that allows characters to be animated.

To animate characters the mesh should contain skin information, so OBJ is not a valid format for meshes.

Rendeer supports two propietary formats for skinned meshes, .MESH (ASCII) and .WBIN (Binary).

Also for skeletal animation it uses its own propieratry format called .SKANIM (ASCII)

## Export animations

To export into Rendeer animated formats you may need to use the converter tool that converts collada files (DAE) into MESH and SKANIM.

You can find [it in this link](https://tamats.com/projects/character_creator/), drag the files there and export them from the menus.

Or you can integrate it in your system using the [collada.js](https://github.com/jagenjo/collada.js) library, and calling the RD.AnimatedCharacterFromScene function.

## RD.Skeleton

The Skeleton class contains information about a body pose.
It stores the hierarchy of the skeleton (which bone is attached to which bone) and its current orientation relative to its parent.

You can create a skeleton like this:

```js
var skeleton = new RD.Skeleton();
``` 

Although you do not need it as SkeletalAnimation already contains a skeleton.

## RD.SkeletalAnimation

The SkeletalAnimation class contains information about the orientation of every bone along time.

You can create one like this:

```js
var anim = new RD.SkeletalAnimation();
``` 

And load from a SKAnim file like this:
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

Then you must be sure that the shader assigned to this mesh uses skinning deformation:
```js
  character.shader = "texture_skinning";
```

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
  character.assignSkeleton( anim.skeleton );
```

## Blending

You can blend between two animations using RD.Skeleton.blend:

```js
var final_skeleton = new RD.Skeleton();
RD.Skeleton.blend( anim1.skeleton, anim2.skeleton, 0.5, final_skeleton);
```




