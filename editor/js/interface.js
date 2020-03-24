var GUI = {
	mainarea: null,
	canvas: null,

	init: function()
	{
		LiteGUI.init(); 

		var mainmenu = this.mainarea = new LiteGUI.Menubar("mainmenubar");
		LiteGUI.add( mainmenu );

		mainarea = new LiteGUI.Area({ id: "mainarea", content_id:"canvasarea", height: "calc( 100% - 20px )", main:true, inmediateResize: true});
		LiteGUI.add( mainarea );

	 
		//create main canvas to test redraw
		var canvas = this.canvas = document.createElement("canvas");
		canvas.width = canvas.height = 100;
		canvas.times = 0;
		canvas.redraw = function() {
			var rect = canvas.parentNode.getClientRects()[0];
			canvas.width = rect.width;
			canvas.height = rect.height;
		}
		mainarea.onresize = function() { canvas.redraw(); };
		mainarea.content.appendChild(canvas);

		//split mainarea
		this.createSidePanel();

		mainarea.getSection(0).split("vertical",[null,"100px"],true);
		mainarea.getSection(0).onresize = function() {
			canvas.redraw();
		};

		mainmenu.add("file/new");
		mainmenu.add("file/open");
		mainmenu.add("file/save");
		mainmenu.add("edit/undo");
		mainmenu.add("edit/redo");
		mainmenu.add("edit/");
		mainmenu.add("edit/copy", { callback: function(){ console.log("COPY"); } });
		mainmenu.add("edit/paste");
		mainmenu.add("edit/clear");
			
		mainmenu.add("view/bottom panel", { callback: function() { docked_bottom.show(); } });
		mainmenu.add("view/fixed size", { callback: function() { LiteGUI.setWindowSize(1000,600); } });
		mainmenu.add("view/");
		mainmenu.add("view/side panel", { callback: function() { createSidePanel(); } });
		mainmenu.add("view/maximize", { callback: function() { LiteGUI.setWindowSize(); } });

		mainmenu.add("debug/dialog", { callback: function() { 
			createDialog();
		}});

		mainmenu.add("debug/message", { callback: function() { 
			LiteGUI.showMessage("This is an example of message");
		}});

		mainmenu.add("debug/modal", { callback: function() { 
			var dialog = new LiteGUI.Panel({width:300,height:100,close:true, content:"This is an example of modal dialog"}); 
			dialog.makeModal();
			dialog.addButton("Accept",{ close: true });
			dialog.addButton("Cancel",{ close: 'fade' });
		}});

		canvas.redraw();
	},

	createSidePanel: function(){

		mainarea.split("horizontal",[null,240],true);
		var docked = new LiteGUI.Panel("right_panel", {title:'Docked panel', close: true});
		mainarea.getSection(1).add( docked );
		window.sidepanel = docked;
		this.updateSidePanel( docked );

	},

	updateSidePanel: function( root )
	{
		root = root || window.sidepanel;
		root.content.innerHTML = "";

		return;

		//tabs 
		var tabs_widget = new LiteGUI.Tabs();
		tabs_widget.addTab("Info");
		tabs_widget.addTab("Tree",{selected:true, width: "100%", height: 200});
		tabs_widget.addTab("Extra");

		//tree
		var mytree = { id: "Rootnode", 
				children: [
					{ id: "Child1" },
					{ id: "Child2", children: [
						{ id: "SubChild1" },
						{ id: "SubChild2" },
						{ id: "SubChild3" },
						{ id: "SubChild4" }
					]},
					{ id: "Child3" },
				]};

		var litetree = new LiteGUI.Tree("tree", mytree, {allow_rename:true});
		LiteGUI.bind( litetree, "item_selected", function(e,node) {
			console.log("Node selected: " + node); 
		});
		var tree_tab_content = tabs_widget.getTabContent("Tree");
		tree_tab_content.appendChild( litetree.root )

		litetree.insertItem( {id:"FOO"}, "Child2",2 );
		//litetree.removeItem( "SubChild1" );
		//litetree.moveItem( "FOO", "Child3" );
		litetree.insertItem( {id:"MAX"}, "Child1" );
		root.add( tabs_widget );

		//side panel widget
		var widgets = new LiteGUI.Inspector();
		widgets.onchange = function(name,value,widget) {
			//console.log("Widget change: " + name + " -> " + value );
		};
		root.content.appendChild(widgets.root);

		widgets.addSlider("slider",10,{min:1,max:100,step:1});
		widgets.addSeparator();

		widgets.addSection("SceneNode");
		widgets.addString("name","foo");
		widgets.addCheckbox("visible",true);
		widgets.addColor("Color",[0,1,0]);
		widgets.addVector3("position",[10,20,30], {min:0});
		widgets.addString("shader","hong");
		//var w = widgets.addCombo("combo","javi",{values:["foo","faa","super largo texto que no cabe entero","javi","nada"], callback: function(name) { console.log("Combo selected: " + name); }});
		//widgets.addComboButtons("combobuttons","javi",{values:["foo","faa","javi","nada"], callback: function(name) { console.log("Combo button selected: " + name); }});

		//mainarea.resize();
	}
}