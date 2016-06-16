// SceneApp.js

import alfrid, { Scene } from 'alfrid';
import ViewAddVel from './ViewAddVel';
import ViewSave from './ViewSave';
import ViewRender from './ViewRender';
import ViewSim from './ViewSim';
import ViewSphere from './ViewSphere';
import ViewShadow from './ViewShadow';

const GL = alfrid.GL;

window.getAsset = function(id) {
	return assets.find( (a) => a.id === id).file;
}

class SceneApp extends alfrid.Scene {
	constructor() {
		super();
		GL.enableAlphaBlending();

		this._count = 0;
		this.orbitalControl.radius.value = 15;
		this.orbitalControl.ry.value = Math.PI * 0.25;
		this.orbitalControl.rx.value = 0.3;
		this.camera.setPerspective(Math.PI/2, GL.aspectRatio, .1, 100);

		this.cameraSphere = new alfrid.CameraPerspective();
		this.cameraSphere.setPerspective(Math.PI/2, 1, .1, 100);
		this.orbitalControlSphere = new alfrid.OrbitalControl(this.cameraSphere);
		this.orbitalControlSphere.radius.setTo(1.5);
		this.orbitalControlSphere.lockZoom(true);

		//	shadow and light 
		this.lightPosition = [.5, 10, 1];
		this.shadowMatrix  = mat4.create();

		const RAD = Math.PI/180;
		this.cameraLight   = new alfrid.CameraPerspective();
		this.cameraLight.setPerspective(90 * RAD * 3, GL.aspectRatio, .5, 400);
		this.cameraLight.lookAt(this.lightPosition, vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0));
		mat4.multiply(this.shadowMatrix, this.cameraLight.projection, this.cameraLight.viewMatrix);
	}

	_initTextures() {
		console.log('init textures');

		let irr_posx = alfrid.HDRLoader.parse(getAsset('irr_posx'));
		let irr_negx = alfrid.HDRLoader.parse(getAsset('irr_negx'));
		let irr_posy = alfrid.HDRLoader.parse(getAsset('irr_posy'));
		let irr_negy = alfrid.HDRLoader.parse(getAsset('irr_negy'));
		let irr_posz = alfrid.HDRLoader.parse(getAsset('irr_posz'));
		let irr_negz = alfrid.HDRLoader.parse(getAsset('irr_negz'));

		this._textureIrr = new alfrid.GLCubeTexture([irr_posx, irr_negx, irr_posy, irr_negy, irr_posz, irr_negz]);
		this._textureRad = alfrid.GLCubeTexture.parseDDS(getAsset('radiance'));

		//	FBOS
		const numParticles = params.numParticles;
		const o = {
			minFilter:GL.NEAREST,
			magFilter:GL.NEAREST
		};

		this._fboCurrentPos = new alfrid.FrameBuffer(numParticles, numParticles, o);
		this._fboTargetPos  = new alfrid.FrameBuffer(numParticles, numParticles, o);
		this._fboCurrentVel = new alfrid.FrameBuffer(numParticles, numParticles, o);
		this._fboTargetVel  = new alfrid.FrameBuffer(numParticles, numParticles, o);
		this._fboExtra  	= new alfrid.FrameBuffer(numParticles, numParticles, o);

		const sphereSize = 256;
		this._fboSphere = new alfrid.FrameBuffer(sphereSize, sphereSize);

		const shadowMapSize = 1024;
		this._fboShadowMap = new alfrid.FrameBuffer(shadowMapSize, shadowMapSize);
	}


	_initViews() {
		console.log('init views');
		
		//	helpers
		this._bCopy = new alfrid.BatchCopy();
		this._bAxis = new alfrid.BatchAxis();
		this._bDots = new alfrid.BatchDotsPlane();
		this._bSkybox = new alfrid.BatchSkybox();


		//	views
		this._vAddVel = new ViewAddVel();
		this._vRender = new ViewRender();
		this._vSim 	  = new ViewSim();
		this._vSphere = new ViewSphere();
		this._vShadow = new ViewShadow();

		this._vSave = new ViewSave();
		GL.setMatrices(this.cameraOrtho);

		this._fboCurrentPos.bind();
		this._vSave.render(0);
		this._fboCurrentPos.unbind();

		this._fboExtra.bind();
		this._vSave.render(1);
		this._fboExtra.unbind();

		this._fboTargetPos.bind();
		this._bCopy.draw(this._fboCurrentPos.getTexture());
		this._fboTargetPos.unbind();

		GL.setMatrices(this.camera);
	}


	updateFbo() {
		//	Update Velocity : bind target Velocity, render simulation with current velocity / current position
		this._fboTargetVel.bind();
		GL.clear(0, 0, 0, 1);
		this._vSim.render(this._fboCurrentVel.getTexture(), this._fboCurrentPos.getTexture(), this._fboExtra.getTexture());
		this._fboTargetVel.unbind();


		//	Update position : bind target Position, render addVel with current position / target velocity;
		this._fboTargetPos.bind();
		GL.clear(0, 0, 0, 1);
		this._vAddVel.render(this._fboCurrentPos.getTexture(), this._fboTargetVel.getTexture());
		this._fboTargetPos.unbind();

		//	SWAPPING : PING PONG
		let tmpVel          = this._fboCurrentVel;
		this._fboCurrentVel = this._fboTargetVel;
		this._fboTargetVel  = tmpVel;

		let tmpPos          = this._fboCurrentPos;
		this._fboCurrentPos = this._fboTargetPos;
		this._fboTargetPos  = tmpPos;

	}


	render() {
		this.orbitalControlSphere.rx.setTo(this.orbitalControl.rx.value);
		this.orbitalControlSphere.ry.setTo(this.orbitalControl.ry.value);

		this._count ++;
		if(this._count % params.skipCount == 0) {
			this._count = 0;
			this.updateFbo();
		}

		let p = this._count / params.skipCount;

		GL.clear(0, 0, 0, 0);

		//	render sphere texture
		this._fboSphere.bind();
		GL.clear(0, 0, 0, 0);
		GL.setMatrices(this.cameraSphere);
		this._vSphere.render();
		this._fboSphere.unbind();


		//	render shadow map
		// this._fboShadowMap.bind();
		// GL.clear(1, 1, 1, 1);
		// GL.gl.depthFunc(GL.gl.LEQUAL);
		// GL.setMatrices(this.cameraLight);
		// this._vShadow.render(this._fboTargetPos.getTexture(), this._fboCurrentPos.getTexture(), p, this._fboExtra.getTexture());
		// this._fboShadowMap.unbind();

		GL.viewport(0, 0, GL.width, GL.height);
		
		// this._bSkybox.draw(this._textureRad);
		GL.setMatrices(this.camera);
		this._vRender.render(this._fboTargetPos.getTexture(), this._fboCurrentPos.getTexture(), p, this._fboExtra.getTexture(), this._fboSphere.getTexture(), this._textureRad, this._textureIrr);


		const size = 200;
		GL.viewport(0, 0, size, size);
		this._bCopy.draw(this._fboSphere.getTexture());
	}


	resize() {
		GL.setSize(window.innerWidth, window.innerHeight);
		this.camera.setAspectRatio(GL.aspectRatio);
	}
}


export default SceneApp;