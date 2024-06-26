import AsyncWrapper from '../components/AsyncWrapper.vue';
import Hello from '../components/Hello.vue';
import { binding, given, then, when } from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';

@binding()
export default class VueTestSteps {
	private helloWrapper: any;
	private asyncWrapper: any;
	private resolve: any;

	@given('There is a valid Basic Vue Component')
	thereIsAValidBasicVueComponent(): any {
		expect(Hello).to.exist;
	}
	@when('The Basic component is mounted')
	theBasicComponentIsMounted(): any {
		this.helloWrapper = mount(Hello, {
			props: {
				count: 4
			},
			stubs: {
				RouterLink: RouterLinkStub
			}
		});
	}
	@then('The Basic component should be testable')
	async theBasicComponentShouldBeTestable(): Promise<any> {
		expect(this.helloWrapper.text()).to.contain('4 x 2 = 8');
		await this.helloWrapper.get('button').trigger('click');
		expect(this.helloWrapper.text()).to.contain('4 x 3 = 12');
		await this.helloWrapper.get('button').trigger('click');
		expect(this.helloWrapper.text()).to.contain('4 x 4 = 16');
	}

	@given('There is a valid Async Vue Component')
	thereIsAValidAsyncVueComponent(): any {
		expect(AsyncWrapper).to.exist;
	}
	@when('The Async component is mounted')
	async theAsyncComponentIsMounted(): Promise<any> {
		const promise = new Promise<void>(_resolve => (this.resolve = _resolve));
		this.asyncWrapper = mount(AsyncWrapper, {
			props: {
				promise
			}
		});
	}
	@then('The Async component should be testable')
	async theAsyncComponentShouldBeTestable(): Promise<any> {
		await nextTick();
		expect(this.asyncWrapper.text()).to.contain('fallback');
		this.resolve();
		await flushPromises();
		await nextTick();
		await nextTick();
		const text = this.asyncWrapper.text();
		expect(text).to.contain('resolved');
	}
}
