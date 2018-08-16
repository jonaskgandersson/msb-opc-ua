var fs = require('fs')
var path = require('path');
var traverse = require('traverse');

var dataPath = path.join(__dirname, 'dataSmall.json')
var data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

var browsePath = ["Objects", " [ProcessingUnit]", "Real Devices", "CMCIII-HUM [CMCIII-HUM]", "Temperature", "Value"]

const arrayToObject = (array, keyField) =>
    array.reduce((obj, item) => {
        obj[item[keyField]] = item
        return obj
    }, {})

// const parentsToPath = (array, keyField) =>
//     array.reduce((obj, item) => {
//         if (item.keys.find(function (el) {
//             return (el === keyField);
//         })) {
//             obj += item.node.browseName;
//         }
//         return obj
//     }, string)

const parentsToPath = (obj, item) => {

        if (item.keys.find(function (el) {
            return (el === keyField);
        })) {
            obj += item.node.browseName;
        }
        return obj
    }

// var objectArray = arrayToObject( data.hasComponent[0].hasComponent[0].organizes[0].organizes[0].organizes , "browseName")

// traverse(data).forEach(function (x) {
//     if (this.isLeaf && this.key === "browseName")
//     {
//         console.log( "Browse name: " + x + ", Level :" + this.level );
//     }
// });

var leaves = traverse(data).reduce(function (acc, x) {

    if (this.isRoot) {
        // acc[x.browseName] = {};
    }
    else {
        if (this.isLeaf) {
            var newPath = this.parents.reduce(parentsToPath);
            acc[newPath] = x;
        }

    }

    // if (this.isLeaf)
    // {
    //     acc[this.key] = x; 
    // }
    // else
    // {
    //     array.forEach(element => {
    //         a
    //     });
    // }

    return acc;
}, {});


