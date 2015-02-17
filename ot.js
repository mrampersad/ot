// textarea problems
// - input events don't tell you what happened, just "something"
// - right-click delete generates an input event, but how do you know something was deleted?

// div problems
// - on ios you cannot popup a keyboard for a div?

var monitor;
var master;
var slave = "";

var UPDATE_FREQUENCY_MS = 1000;

var XHR_READYSTATE_DONE = 4;
var HTTP_STATUS_OK = 200;
var HTTP_STATUS_STOPPED = 0;

var OT_NOP = 0;
var OT_INSERT = 1;
var OT_DELETE = 2;

var KEYCODE_BACKSPACE = 8;
var KEYCODE_DELETE = 46;

var ot = {
	client_id: null,
	client_op_id: 0,
	server_index: 0,
	buffer: [],
	xhr: new XMLHttpRequest(),
	
	// GENERIC CODE FOR ANY USE CASE
	
	init: function() {
		var that = this;
		
		this.xhr.open("POST", "ot.php");
		
		var qs = "action=join";
		
		this.xhr.responseType = "json";
		this.xhr.onreadystatechange = function() {
			if(this.readyState == XHR_READYSTATE_DONE) {
				if(this.status == HTTP_STATUS_OK) {
					if(this.response.type == "exception") {
						throw this.response.message;
					}
					
					// save our client_id
					that.client_id = this.response.data;
					
					// start the receive pump
					that.recvPump();
					setInterval(function() { that.recvPump(); }, UPDATE_FREQUENCY_MS);
					
					// start the send pump
					that.sendPump();
					setInterval(function() { that.sendPump(); }, UPDATE_FREQUENCY_MS);
				} else if(this.status == HTTP_STATUS_STOPPED) {
					// do nothing
				} else {
					throw this.statusText;
				}
			}
		};
		
		this.xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
		this.xhr.send(qs);
	},
	
	recvPump: function() {
		var that = this;
		
		this.xhr.open("POST", "ot.php");
		
		var qs = "action=recv";
		qs += "&index=" + this.server_index;
		
		this.xhr.responseType = "json";
		this.xhr.onreadystatechange = function() {
			if(this.readyState == XHR_READYSTATE_DONE) {
				if(this.status == HTTP_STATUS_OK) {
					if(this.response.type == "exception") {
						throw this.response.message;
					}
					
					for(var i = 0; i < this.response.data.length; i++) {
						that.recv(this.response.data[i]);
					}
				} else if(this.status == HTTP_STATUS_STOPPED) {
					// do nothing
				} else {
					throw this.statusText;
				}
			}
		};
		
		this.xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
		this.xhr.send(qs);
	},
	
	sendPump: function() {
		var that = this;
		
		if(!this.buffer.length) return;
		
		this.xhr.open("POST", "ot.php");
		
		var qs = "action=send";
		qs += "&index=" + this.server_index;
		qs += "&client_id=" + this.client_id;
		qs += "&client_op_id=" + this.buffer[0].client_op_id;
		qs += "&op=" + encodeURIComponent(JSON.stringify(this.buffer[0].op));
		
		this.xhr.responseType = "json";
		this.xhr.onreadystatechange = function() {
			if(this.readyState == XHR_READYSTATE_DONE) {
				if(this.status == HTTP_STATUS_OK) {
					if(this.response.type == "exception") {
						throw this.response.message;
					}
					
					// successful send means there should be something to retrieve
					setTimeout(function() { that.recvPump(); }, 0);
				} else if(this.status == HTTP_STATUS_STOPPED) {
					// do nothing
				} else {
					throw this.statusText;
				}
			}
		};
		
		this.xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
		this.xhr.send(qs);
	},
	
	send: function(op) {
		var msg = {};
		msg.client_op_id = this.client_op_id;
		msg.op = op;
		this.buffer.push(msg);
		this.client_op_id++;
	},
	
	recv: function(msg) {
		var that = this;
		
		// because xhr is async, and recvPump is called from multiple places
		// sometimes we will receive messages we have already seen
		// we can throw them away here
		if(msg.id <= this.server_index) {
			//console.log("duplicate op received");
			return;
		}
		
		this.server_index = msg.id;
		
		var own_op = false;
		
		if(this.buffer.length) {
			if(msg.client_id == this.client_id && msg.client_op_id == this.buffer[0].client_op_id) {
				this.buffer.shift();
				own_op = true;
				
				// seeing own items means we can try to send the next one
				setTimeout(function() { that.sendPump(); }, 0);
			} else {
				for(var i = 0; i < this.buffer.length; i++) {
					this.xform(this.buffer[i].op, msg.op);
				}
			}
		} else if(msg.client_id == this.client_id) {
			throw "unexpected own event";
		}

		if(!own_op) {
			this.apply(msg.op);
		}
	},
	
	// SPECIFIC TO OUR USE CASE
	
	// apply an operation
	apply: function(op) {
		// record selection state
		var selStart = master.selectionStart;
		var selEnd = master.selectionEnd;
		var selDir = master.selectionDirection;
		
		if(op.type == OT_NOP) {
			// do nothing
		} else if(op.type == OT_INSERT) {
			if(op.start > master.value.length) {
				throw "insert out of range";
			}
			
			master.value = master.value.substring(0, op.start) + op.text + master.value.substring(op.start);
			
			// update selection state
			if(op.start <= selStart) selStart++;
			if(op.start < selEnd) selEnd++;
		} else if(op.type == OT_DELETE) {
			if(op.start >= master.value.length) {
				throw "delete out of range";
			}
			
			master.value = master.value.substring(0, op.start) + master.value.substring(op.start + 1);
			
			// update selection state
			if(op.start < selStart) selStart--;
			if(op.start < selEnd) selEnd--;
		}
		
		master.setSelectionRange(selStart, selEnd, selDir);
	},
	
	xform: function(a, b) {
		if(a.type == OT_NOP && b.type == OT_NOP) {
			// do nothing
		} else if(a.type == OT_NOP && b.type == OT_INSERT) {
			// do nothing
		} else if(a.type == OT_NOP && b.type == OT_DELETE) {
			// do nothing
		} else if(a.type == OT_INSERT && b.type == OT_NOP) {
			// do nothing
		} else if(a.type == OT_INSERT && b.type == OT_INSERT) {
			if(a.start < b.start) {
				b.start++;
			} else if(a.start > b.start) {
				a.start++;
			} else {
				// tie goes to server
				a.start++;
			}
		} else if(a.type == OT_INSERT && b.type == OT_DELETE) {
			if(a.start < b.start) {
				b.start++;
			} else if(a.start > b.start) {
				a.start--;
			} else {
				// tie goes to insert
				b.start++;
			}
		} else if(a.type == OT_DELETE && b.type == OT_NOP) {
			// do nothing
		} else if(a.type == OT_DELETE && b.type == OT_INSERT) {
			if(a.start < b.start) {
				b.start--;
			} else if(a.start > b.start) {
				a.start++;
			} else {
				// tie goes to insert
				a.start++;
			}
		} else if(a.type == OT_DELETE && b.type == OT_DELETE) {
			if(a.start < b.start) {
				b.start--;
			} else if(a.start > b.start) {
				a.start--;
			} else {
				a.type = OT_NOP;
				delete a.start;
				
				b.type = OT_NOP;
				delete b.start;
			}
		} else {
			throw "not implemented";
		}
	},
};



document.addEventListener('DOMContentLoaded', function() {
	monitor = document.getElementById('monitor');
	
	master = document.getElementById('master');
	
	ot.init();
	
	// fixme, should correct selection start and end
	// newline counts.. something like
	// for(var i = 0; i < master.value.length; i++)
	// if(master.value.at(i) == "\r\n")
	//	if selectionstart > i; selectionstart--
	//	if selectionend > i; selectionend--
	
	// regular keypress
	master.addEventListener('keypress', function(e) {
		//console.log(e);
		
		for(var i = master.selectionStart; i < master.selectionEnd; i++) {
			ot.send({ type: OT_DELETE, start: master.selectionStart });
		}
		
		if(e.keyCode == 13) {
			ot.send({ type: OT_INSERT, start: master.selectionStart, text: "\n" });
		} else {
			ot.send({ type: OT_INSERT, start: master.selectionStart, text: String.fromCharCode(e.charCode) });
		}
	});
	
	// backspace and delete
	master.addEventListener('keydown', function(e) {
		if(e.keyCode == KEYCODE_BACKSPACE) {
			if(master.selectionEnd > master.selectionStart) {
				for(var i = master.selectionStart; i < master.selectionEnd; i++) {
					ot.send({ type: OT_DELETE, start: master.selectionStart });
				}
			} else if(master.selectionStart > 0) {
				ot.send({ type: OT_DELETE, start: master.selectionStart - 1 });
			}
		} else if(e.keyCode == KEYCODE_DELETE) {
			if(master.selectionEnd > master.selectionStart) {
				for(var i = master.selectionStart; i < master.selectionEnd; i++) {
					ot.send({ type: OT_DELETE, start: master.selectionStart });
				}
			} else	if(master.selectionStart < master.value.length) {
				ot.send({ type: OT_DELETE, start: master.selectionStart });
			}
		} else {
			// ignore other keys
			//console.log(e.keyCode);
		}
	});
	
	// cut
	master.addEventListener('cut', function(e) {
		// delete our selection
		for(var i = master.selectionStart; i < master.selectionEnd; i++) {
			ot.send({ type: OT_DELETE, start: master.selectionStart });
		}
	});
	
	// paste
	master.addEventListener('paste', function(e) {
		var text = e.clipboardData.getData("text/plain");
		
		// delete our selection
		for(var i = master.selectionStart; i < master.selectionEnd; i++) {
			ot.send({ type: OT_DELETE, start: master.selectionStart });
		}
		
		// insert the chars
		for(var i = 0; i < text.length; i++) {
			ot.send({ type: OT_INSERT, start: master.selectionStart + i, text: text.charAt(i) });
		}
	});
});
