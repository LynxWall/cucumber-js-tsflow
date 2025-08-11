// This is enough for almost all SFCs used with @vue/compiler-sfc and @vue/test-utils.
declare module '*.vue' {
  import { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, any>, Record<string, any>, any>
  export default component
}
