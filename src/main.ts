import './style.css'

const WIDTH = 144;
const HEIGHT = 144;
const RENDER_SCALE = 10;

const PARTICLE_COUNT = 1000;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <canvas id="canvas" width=${WIDTH * RENDER_SCALE} height=${HEIGHT * RENDER_SCALE} />
`

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
const ctx = canvas?.getContext("2d")!;

// Get the standard distributuion of the distance sensor value
function sensor_sd(distance: number) {
    const variance = Math.max(distance * 0.05, 0.590551);

    return variance / 3;
    // return variance;
}

// Get a randon normal according to a gaussian distribution https://stackoverflow.com/questions/25582882/javascript-math-random-normal-distribution-gaussian-bell-curve
function gaussian_random(mean: number, stdev: number) {
    const u = 1 - Math.random(); // Converting [0,1) to (0,1]
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    // Transform to the desired mean and standard deviation:
    return z * stdev + mean;
}

// Get the probability at a value x on a normal distribution
function normal_dist(x: number, mu: number, sd: number) {
    const epsilon = 0.0000000000001;

    return Math.max(
        (Math.E ** (-1 / 2 * ((x - mu) / sd) ** 2))
        /
        (sd * Math.sqrt(2 * Math.PI)),
        epsilon);
}

// Draw visualization
function render(max_weight: number, predicted_x: number, predicted_y: number, odom_x: number, odom_y: number) {
    function circle(x: number, y: number, radius: number) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
    }

    ctx.clearRect(0, 0, WIDTH * RENDER_SCALE, HEIGHT * RENDER_SCALE);

    for (const particle of particles) {
        ctx.fillStyle = `rgba(0, 0, 255, ${particle.weight / max_weight})`;
        // ctx.fillStyle = `rgba(0, 0, 255, ${1})`;
        circle(particle.x * RENDER_SCALE, particle.y * RENDER_SCALE, 0.1 * RENDER_SCALE);
    }

    ctx.fillStyle = `rgb(0, 255, 0)`;
    circle(robot_x * RENDER_SCALE, robot_y * RENDER_SCALE, 0.5 * RENDER_SCALE);
    ctx.beginPath();
    ctx.moveTo(robot_x * RENDER_SCALE, robot_y * RENDER_SCALE);
    ctx.lineTo(robot_x * RENDER_SCALE + Math.cos(robot_theta) * 2 * RENDER_SCALE, robot_y * RENDER_SCALE + Math.sin(robot_theta) * 2 * RENDER_SCALE);
    ctx.stroke();

    ctx.fillStyle = `rgb(255, 0, 0)`;
    circle(predicted_x * RENDER_SCALE, predicted_y * RENDER_SCALE, 0.5 * RENDER_SCALE);
    ctx.fillStyle = `rgb(255, 0, 255)`;
    circle(odom_x * RENDER_SCALE, odom_y * RENDER_SCALE, 0.5 * RENDER_SCALE);
}

// Fake a distance sensor value
function sensor_value(theta_offset: number) {
    const left_t = (0 - robot_x) / Math.cos(robot_theta + theta_offset);
    const right_t = (144 - robot_x) / Math.cos(robot_theta + theta_offset);
    const bottom_t = (0 - robot_y) / Math.sin(robot_theta + theta_offset);
    const top_t = (144 - robot_y) / Math.sin(robot_theta + theta_offset);

    const left_y = robot_y + left_t * Math.sin(robot_theta + theta_offset)
    if (left_t > 0 && left_y >= 0 && left_y <= 144) {
        const dist = Math.sqrt((robot_x - 0) ** 2 + (robot_y - left_y) ** 2)
        return gaussian_random(dist, sensor_sd(dist));
    }

    const right_y = robot_y + right_t * Math.sin(robot_theta + theta_offset)
    if (right_t > 0 && right_y >= 0 && right_y <= 144) {
        const dist = Math.sqrt((robot_x - 144) ** 2 + (robot_y - right_y) ** 2);
        return gaussian_random(dist, sensor_sd(dist));
    }

    const bottom_x = robot_x + bottom_t * Math.cos(robot_theta + theta_offset)
    if (bottom_t > 0 && bottom_x >= 0 && bottom_x <= 144) {
        const dist = Math.sqrt((robot_x - bottom_x) ** 2 + (robot_y - 0) ** 2);
        return gaussian_random(dist, sensor_sd(dist));
    }

    const top_x = robot_x + top_t * Math.cos(robot_theta + theta_offset)
    if (top_t > 0 && top_x >= 0 && top_x <= 144) {
        const dist = Math.sqrt((robot_x - top_x) ** 2 + (robot_y - 144) ** 2);
        return gaussian_random(dist, sensor_sd(dist));
    }

    return NaN;
}

interface Particle {
    x: number,
    y: number,
    weight: number,
}

let particles = new Array<Particle>();

// Robot pose
let robot_x = 36;
let robot_y = 48;
let robot_theta = Math.PI / 4 + Math.PI / 6;

// Update particle positions based on current weights 
function resample() {
    let max_weight = 0;
    for (const particle of particles) {
        if (particle.weight > max_weight) {
            max_weight = particle.weight;
        }
    }

    const full_random_particles = PARTICLE_COUNT * 0.2;
    // const full_random_particles = 0;

    const new_particles = new Array<Particle>();

    let index = Math.floor(Math.random() * particles.length);
    let beta = 0;
    for (let i = 0; i < particles.length - full_random_particles; i++) {
        beta += Math.random() * 2 * max_weight;
        while (beta > particles[index].weight) {
            beta -= particles[index].weight;
            index = (index + 1) % particles.length;
        }

        new_particles.push({
            x: particles[index].x,
            y: particles[index].y,
            weight: NaN
        });
    }

    for (let i = 0; i < full_random_particles; i++) {
        new_particles.push({
            x: Math.random() * 144,
            y: Math.random() * 144,
            weight: 1
        });
    }

    particles = new_particles;
}

// Move all the particles based on predicted position change
function motion_update(delta_x: number, delta_y: number) {
    for (let i = 0; i < particles.length; i++) {
        particles[i].x += gaussian_random(delta_x, 0.1);
        particles[i].y += gaussian_random(delta_y, 0.1);
    }
}

// Use the sensor values to update the weights of the particles
function sensor_update() {
    const sensor_front = sensor_value(0);
    const sensor_left = sensor_value(Math.PI / 2);
    const sensor_right = sensor_value(-Math.PI / 2);
    const sensor_back = sensor_value(Math.PI);

    const theta_left = robot_theta + Math.PI / 2;
    const theta_right = robot_theta - Math.PI / 2;
    const theta_back = robot_theta + Math.PI;

    const front_x_predict = Math.cos(robot_theta) > 0 ? 144 - sensor_front * Math.cos(robot_theta) : -sensor_front * Math.cos(robot_theta);
    const front_y_predict = Math.sin(robot_theta) > 0 ? 144 - sensor_front * Math.sin(robot_theta) : -sensor_front * Math.sin(robot_theta);

    const left_x_predict = Math.cos(theta_left) > 0 ? 144 - sensor_left * Math.cos(theta_left) : -sensor_left * Math.cos(theta_left);
    const left_y_predict = Math.sin(theta_left) > 0 ? 144 - sensor_left * Math.sin(theta_left) : -sensor_left * Math.sin(theta_left);

    const right_x_predict = Math.cos(theta_right) > 0 ? 144 - sensor_right * Math.cos(theta_right) : -sensor_right * Math.cos(theta_right);
    const right_y_predict = Math.sin(theta_right) > 0 ? 144 - sensor_right * Math.sin(theta_right) : -sensor_right * Math.sin(theta_right);

    const back_x_predict = Math.cos(theta_back) > 0 ? 144 - sensor_back * Math.cos(theta_back) : -sensor_back * Math.cos(theta_back);
    const back_y_predict = Math.sin(theta_back) > 0 ? 144 - sensor_back * Math.sin(theta_back) : -sensor_back * Math.sin(theta_back);

    for (const particle of particles) {
        particle.weight =
            Math.max(normal_dist(particle.x, front_x_predict, sensor_sd(sensor_front)),
                normal_dist(particle.y, front_y_predict, sensor_sd(sensor_front))) *
            Math.max(normal_dist(particle.x, left_x_predict, sensor_sd(sensor_left)),
                normal_dist(particle.y, left_y_predict, sensor_sd(sensor_left))) *
            Math.max(normal_dist(particle.x, right_x_predict, sensor_sd(sensor_right)),
                normal_dist(particle.y, right_y_predict, sensor_sd(sensor_right))) *
            Math.max(normal_dist(particle.x, back_x_predict, sensor_sd(sensor_back)),
                normal_dist(particle.y, back_y_predict, sensor_sd(sensor_back)));
    }
}

// Initialize the particle list, one of the particles is set to the predetermined initial position for faster convergance
for (let i = 0; i < PARTICLE_COUNT; i++) {
    const x = Math.random() * 144;
    const y = Math.random() * 144;

    particles.push({
        x: x,
        y: y,
        weight: normal_dist(x, robot_x, 0.5) * normal_dist(y, robot_y, 0.5)
    });
}
particles[0].x = robot_x;
particles[0].y = robot_y;
particles[0].weight = normal_dist(robot_x, robot_x, 0.5) * normal_dist(robot_y, robot_y, 0.5);

// Predicted position of the robot with dead reckoning
let odom_x = robot_x;
let odom_y = robot_y;

let last_x = robot_x;
let last_y = robot_y;
let tick = 0;
// The main loop
setInterval(() => {
    motion_update(robot_x - last_x, robot_y - last_y);
    resample();
    sensor_update();

    particles.sort((a, b) => b.weight - a.weight);

    let predicted_x = 0;
    let predicted_y = 0;
    let total_weight = 0;
    for (const particle of particles) {
        predicted_x += particle.x * particle.weight;
        predicted_y += particle.y * particle.weight;
        total_weight += particle.weight;
    }
    predicted_x /= total_weight;
    predicted_y /= total_weight;

    render(particles[0].weight, predicted_x, predicted_y, odom_x, odom_y);

    // console.log(Math.sqrt((robot_x - predicted_x) ** 2 +  (robot_y - predicted_y) ** 2));

    last_x = robot_x;
    last_y = robot_y;

    robot_x += Math.sin(tick / 10);
    robot_y += Math.cos(tick / 10);
    robot_theta = -tick / 10 + Math.PI / 2;

    odom_x += gaussian_random(Math.sin(tick / 10), 0.05);
    odom_y += gaussian_random(Math.cos(tick / 10), 0.05);

    tick += 1;
}, 100);