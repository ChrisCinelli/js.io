jsio('import Class, bind');
jsio('import jsio.logging');
jsio('from jsio.interfaces import PubSub');
jsio('from jsio.protocols.rtjp import RTJPProtocol');
jsio('from ..constants import *');

var logger = jsio.logging.getLogger('world.client');
logger.setLevel(0);

var World = Class(function() {
	this.init = function(playerFactory) {
		this.playerFactory = playerFactory;
		this.players = {};
		this.interval = 0;
		this._active = [];
		this._update = bind(this, 'update');
	}
	
	this.getPlayer = function(username) { return this.players[username]; }
	
	this.movePlayer = function(username, x, y) {
		var player = this.players[username];
		if(!player.isMoving()) {
			this._active.push(player);
		}
		player.move(x, y);
		if(!this.interval) { this.interval = setTimeout(this._update, 25); }
	}
	
	this.update = function() {
		var again = false;
		var active = [];
		for(var  i = 0, p; p = this._active[i]; ++i) {
			if(p.update()) {
				again = true;
				active[active.length] = p;
			}
		}
		this._active = active;
		this.interval = again ? setTimeout(this._update, 25) : null;
	}
	
	this.addPlayer = function(params) {
		if(!(params.username in this.players)) {
			this.players[params.username] = this.playerFactory(params);
			if(!this.interval) { this.interval = setTimeout(this._update, 25); }
		}
	}
	
	this.deletePlayer = function(username) {
		this.players[username].destroy();
		delete this.players[username];
	}
});

exports.WorldProtocol = Class([RTJPProtocol, PubSub], function(supr) {
	this.init = function(playerFactory) {
		supr(this, 'init');
		this.world = new World(playerFactory);
		this._isConnected = false;
	}
	
	this.connect = function(transport, url) {
		this.url = url || this.url;
		this.transport = transport || this.transport || 'csp';
		if(!this._isConnected) {
			jsio.connect(this, this.transport, {url: this.url});
		}
	}
	
	this.isConnected = function() { return this._isConnected; }
	
	this.login = function(username) {
		this.username = username;
		if(this._isConnected) {
			this.sendFrame('LOGIN', {username: this.username});
		}
	}
	
	// Public api
	
	this.onWelcome = function(presence, history) {
		for(var i = 0, p; p = presence[i]; ++i) {
			this.world.addPlayer(p);
		}
		
		this.self = this.world.getPlayer(this.username);
		if(!this.self) {
			this.onError('could not join');
		}
	}

	this.onSay = function(params) {
		var p = this.world.getPlayer(params.username);
		
		p.say(params.msg, params.ts);
		this.publish('say', params, p.color);
	}
	
	this.onError = function(msg) {
		alert(msg);
	}
	
	this.move = function(x,y) {
		
		if(x < kBounds.minX) x = kBounds.minX;
		if(x > kBounds.maxX) x = kBounds.maxX;
		if(y < kBounds.minY) y = kBounds.minY;
		if(y > kBounds.maxY) y = kBounds.maxY;
		
		this.world.movePlayer(this.username, x, y);
		
		try {
			this.sendFrame('MOVE', {x:x, y:y});
		} catch(e) {}
	}

	this.say = function(msg) {
		this.self.say(msg);
		this.publish('say', {username: this.username, msg: msg, ts: +new Date(), color: this.self.color})
		try {
			this.sendFrame('SAY', {msg: msg});
		} catch(e) {}
	}
	
	this.shoot = function() {
		var args = {
			x: this.self._x,
			y: this.self._y,
			dx: this.self.x - this.self._x,
			dy: this.self.y - this.self._y
		}
		
		if (!args.dx || !args.dy) { return; } // can't shoot standing still
		
		this.sendFrame('SHOOT', args);
		this.publish('shoot', args);
	}

	// Callbacks
	this.frameReceived = function(id, name, args) {
		logger.debug('frameReceived', id, name, args);
		switch(name) {
			case 'WELCOME':
				this.onWelcome(args.presence, args.history);
				this.publish('welcome', args.presence, args.history);
				break;
			case 'SAY':
				this.onSay(args);
				break;
			case 'MOVE':
				this.world.move(args.username, args.x, args.y);
				break;
			case 'SHOOT':
				this.publish('shoot', args);
				break;
			case 'JOIN':
				this.world.addPlayer(args);
				break;
			case 'LEAVE':
				this.world.deletePlayer(args.username);
				break;
			case 'ERROR':
				this.onError(args.msg);
				break;
			default:
				break;
		}
	}
	
	this.connectionMade = function() {
		this._isConnected = true;
		if(this.username) {
			this.login(this.username);
		}
	}
	
	this.connectionLost = function() {
		this._isConnected = false;
	}
});
