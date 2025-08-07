// This is enough for almost all SFCs used with @vue/compiler-sfc and @vue/test-utils.
declare module '*.vue' {
  import { DefineComponent } from 'vue'
	// eslint-disable-next-line
  const component: DefineComponent<{}, {}, any>
  export default component
}
