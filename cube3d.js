import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import RubiksCubeSolver from './lib/solver.js';
import Cubie from './cubie.js';
import COLORS from './colors.js';

export default class Cube3D {
    // Order of cubies in permutation and orientation states
    static CUBIE_ORDER = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL',
        'UFR', 'URB', 'UBL', 'ULF', 'DRF', 'DFL', 'DLB', 'DBR'];

    savedCubies = [];

    // Throttle the viewport to 10 FPS when not rotating to save power
    throttle = true;

    permutation = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    orientation = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    constructor(answerState) {
        // Set up scene, camera, renderer, and controls
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(5, 5, 5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);

        const controls = new OrbitControls(this.camera, this.renderer.domElement);
        controls.enablePan = false;
        controls.enableZoom = false;

        this.selection = new THREE.Mesh(
            new THREE.BoxGeometry(),
            new THREE.MeshBasicMaterial({ color: 'black', transparent: true, opacity: 0.5 }),
        );
        this.selection.visible = false;
        this.scene.add(this.selection);

        this.animate();
        document.body.appendChild(this.renderer.domElement);

        // Generate cubies
        const CUBIES = [
            'DLB', 'DL', 'DFL', 'BL', 'L', 'FL', 'UBL', 'UL', 'ULF',
            'DB', 'D', 'DF', 'B', '', 'F', 'UB', 'U', 'UF',
            'DBR', 'DR', 'DRF', 'BR', 'R', 'FR', 'URB', 'UR', 'UFR',
        ];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                for (let k = 0; k < 3; k++) {
                    const cubie = new Cubie(i - 1, j - 1, k - 1, CUBIES[i * 9 + j * 3 + k]);
                    this.savedCubies.push(cubie);
                    this.scene.add(cubie);
                }
            }
        }

        // Save cursor position on pointer down to distinguish rotating and painting
        this.renderer.domElement.addEventListener('pointerdown', event => {
            this.throttle = false;
            this.cursorPos = [event.clientX, event.clientY];
        });
        this.renderer.domElement.addEventListener('pointerup', event => {
            this.throttle = true;
            // Don't do anything if already won
            if (document.getElementById('actions').childElementCount === 1) return;
            // Ensure cursor hasn't moved since pointer was down, as that is a rotation event
            if (Math.hypot(event.clientX - this.cursorPos[0], event.clientY - this.cursorPos[1]) > 1) return;
            const clicked = this.findClickedCubie(event);
            // Ignore clicks that don't intersect with a cubie
            if (clicked === undefined) return;
            this.initPicker(clicked.object);
        });

        this.answerPermutation = answerState.slice(0, 20);
        this.answerOrientation = answerState.slice(20);

        // Automatically resize viewport when window is resized
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    initPicker(cubie, keepSelection) {
        // Set up cubie picker
        const picker = document.getElementById('picker');
        const erase = document.getElementById('erase');
        const rotate = document.getElementById('rotate');
        const stateIndex = Cube3D.getStateIndex(cubie.name);
        picker.replaceChildren();
        if (!keepSelection && cubie.position.equals(this.selection.position)) {
            this.selection.position.set(0, 0, 0);
            this.selection.visible = false;
            erase.disabled = true;
            rotate.disabled = true;
        } else {
            this.selection.position.copy(cubie.position);
            this.selection.visible = true;
            const CUBIES = [];
            // Prevent user from modifying correct pieces
            if (cubie.name.length === 1 || this.correct(stateIndex)) {
                erase.disabled = true;
                rotate.disabled = true;
                this.selection.material.opacity = 0.25;
                return;
            }
            else if (cubie.name.length === 2) {
                CUBIES.push('UB', 'UL', 'DB', 'DL', 'BL', 'FL', 'UF', 'UR', 'DF', 'DR', 'BR', 'FR');
            } else if (cubie.name.length === 3) {
                CUBIES.push('UBL', 'ULF', 'UFR', 'URB', 'DLB', 'DFL', 'DRF', 'DBR');
            }
            this.selection.material.opacity = 0.5;
            for (const piece of CUBIES) {
                // Initialize button
                const buttonsPerRow = (piece.length === 2) ? 6 : 4;
                const button = picker.appendChild(document.createElement('button'));
                button.classList.add('cubie');
                button.style.width = (picker.offsetWidth - 10 * buttonsPerRow) / buttonsPerRow + 'px';

                // Draw cubie onto button
                const canvas = button.appendChild(document.createElement('canvas'));
                canvas.width = button.clientWidth;
                canvas.height = button.clientHeight;
                const ctx = canvas.getContext('2d');
                for (let i = 0; i < piece.length; i++) {
                    const color = COLORS[piece.charAt(i)];
                    const perWidth = canvas.width / piece.length;
                    ctx.fillStyle = `rgb(${color.r * 256}, ${color.g * 256}, ${color.b * 256})`;
                    ctx.fillRect(perWidth * i, 0, perWidth, canvas.height);
                }
                button.disabled = this.permutation.includes(Cube3D.getStateIndex(piece));
                button.onclick = () => {
                    cubie.setColors(piece);
                    this.permutation[stateIndex] = Cube3D.getStateIndex(piece);
                    this.orientation[stateIndex] = 0;
                    this.initPicker(cubie, true);
                    this.updateParity();
                }
            }

            // Enable buttons
            erase.disabled = false;
            erase.onclick = () => {
                cubie.erase();
                this.permutation[stateIndex] = -1;
                this.initPicker(cubie, true);
                this.updateParity();
            };
            rotate.disabled = false;
            rotate.onclick = () => {
                cubie.rotate();
                this.orientation[stateIndex]--;
                if (this.orientation[stateIndex] < 0) {
                    this.orientation[stateIndex] = cubie.name.length - 1;
                }
                this.updateParity();
            }
        }
    }

    updateParity() {
        const solver = new RubiksCubeSolver();
        solver.currentState = [...this.permutation, ...this.orientation];
        const ep = solver.edgeParity();
        const cp = solver.cornerParity();
        const pp = solver.permutationParity();
        document.getElementById('parity').innerText = `EP: ${ep}, CP: ${cp}, PP: ${pp}`;
        if (ep !== 0 || cp !== 0 || pp !== 0) {
            document.getElementById('parity').style.color = 'red';
        } else {
            document.getElementById('parity').style.color = 'white';
        }
    }

    correct(index) {
        const lastPermutation = JSON.parse(localStorage.getItem('permutation'));
        const lastOrientation = JSON.parse(localStorage.getItem('orientation'));
        return lastPermutation[index] === this.answerPermutation[index]
            && lastOrientation[index] === this.answerOrientation[index];
    }

    save() {
        for (const savedCubie of this.savedCubies) {
            localStorage.setItem(savedCubie.name, savedCubie.colors);
        }
        localStorage.setItem('permutation', JSON.stringify(this.permutation));
        localStorage.setItem('orientation', JSON.stringify(this.orientation));
    }

    load() {
        for (const savedCubie of this.savedCubies) {
            savedCubie.setColors(localStorage.getItem(savedCubie.name));
        }
        this.permutation = JSON.parse(localStorage.getItem('permutation'));
        this.orientation = JSON.parse(localStorage.getItem('orientation'));
    }

    static getStateIndex(cubie) {
        return Cube3D.CUBIE_ORDER.indexOf(cubie);
    }

    findClickedCubie(event) {
        // Cast ray
        const pointer = new THREE.Vector2();
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, this.camera);
        return raycaster.intersectObjects(this.scene.children)[0];
    }

    animate() {
        if (this.throttle) {
            setTimeout(() => {
                requestAnimationFrame(() => this.animate());
            }, 1000 / 10);
        } else {
            requestAnimationFrame(() => this.animate());
        }
        this.renderer.render(this.scene, this.camera);
    }
}
