import '@fortawesome/fontawesome-free/css/all.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@zyno-io/vue-foundation/dist/vue-foundation.css';
import './openapi-client';
import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './app.vue';
import router from './router';
import { setupVf } from './vf.setup';

const app = createApp(App);
setupVf(app);

app.use(createPinia());
app.use(router);

// App.vue renders Login directly while there is no session. Wait for the initial navigation so
// that an OAuth callback's code and state are present before Login's onMounted hook runs.
await router.isReady();
app.mount(document.body);
