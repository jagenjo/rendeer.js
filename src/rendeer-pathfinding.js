class Waypoint {
    enabled = true
    id = -1
    position = [0,0,0]
    links = []
    origin = null
}


//WIP

class Pathfinding {
    
    points = []
    ready = false


    build(nodes, gridsize = 1){

        var middle = vec3.create();
        //iterate nodes
        for(var i = 0; i < nodes.length; ++i)
        {
            var node = nodes[i];
            var mesh = gl.meshes[ node.mesh ];
            if(!mesh)
                throw "mesh not found"
            //iterate triangles
            var model = node.getGlobalMatrix()
            var edge_connections = new Map()
            var mesh_indices = mesh.getIndexBuffer("triangles")?.data;
            var mesh_vertices = mesh.getVertexBuffer("vertices")?.data;
            if(!mesh_indices || !mesh_vertices)
                throw "buffers missing"
            for(var j = 0; j < mesh_indices.length; j+=3)
            {
                var aI = mesh_indices[j];
                var bI = mesh_indices[j+1];
                var cI = mesh_indices[j+2];
                var triangleIndices = [aI,bI,cI]
                var A = mesh_vertices.subarray( aI*3, aI*3+3);
                var B = mesh_vertices.subarray( bI*3, bI*3+3);
                var C = mesh_vertices.subarray( cI*3, cI*3+3);
                var point = new Waypoint()
                point.id = j/3;
                var center = findTriangleCenter(A,B,C,point.position)
                mat4.multiplyVec3(center,model,center)
                for(var k = 0; k < 3; ++k)
                {
                    var tIndex = triangleIndices[k];
                    var tIndex2 = triangleIndices[(k+1)%3];
                    if(tIndex>tIndex2)
                        [tIndex,tIndex2]=[tIndex2,tIndex]
                    var pos = mesh_vertices.subarray( tIndex*3, tIndex*3+3);
                    var pos2 = mesh_vertices.subarray( tIndex2*3, tIndex2*3+3);
                    vec3.lerp(middle,pos,pos2,0.5)
                    var hash = `${hashVec3(middle)}`
                    var connections = edge_connections.get(hash);
                    if(!connections)
                        edge_connections.set(hash,point)
                    else
                    {
                        point.links.push(connections)
                        connections.links.push(point)
                    }
                }
                this.points.push(point)
            }
        }

        this.ready = true
        console.log(this.points)

        function hashNumber(v) { return (Math.round(v * 100)/100).toFixed(2); }
        function hashVec3(v) { return `${hashNumber(v[0])},${hashNumber(v[1])},${hashNumber(v[2])}`; }
        return this.points;
    }

    findPath(A,B)
    {
        
    }

    findNearestPoint(position)
    {
    }

    getVertices()
    {
        var numLinks = 0;
        var vertices = new Float32Array(3 * this.points.length);
        for(var i = 0; i < this.points.length; ++i)
        {
            var p = this.points[i];
            vertices.set( p.position, i*3 );
            numLinks += p.links.length
        }

        var indices = new Uint32Array(2 * numLinks);
        var curr = 0
        for(var i = 0; i < this.points.length; ++i)
        {
            var p = this.points[i];
            for(var j = 0; j < p.links.length; ++j)
            {
                if(p.id < p.links[j].id)
                {
                    indices[curr*2] = p.id;
                    indices[curr*2+1] = p.links[j].id;
                    curr+=2
                }
            }
        }

        return { vertices, indices }
    }
}

function findTriangleCenter(A,B,C,P)
{
    P[0] = (A[0] + B[0] + C[0]) / 3
    P[1] = (A[1] + B[1] + C[1]) / 3
    P[2] = (A[2] + B[2] + C[2]) / 3
    return P
}

RD.Pathfinding = Pathfinding;