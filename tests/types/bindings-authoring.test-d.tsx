import { NSEObject } from '../../src/NSE/Objects/NSEObject';
import { observable } from '../../src/NSE/Objects/observable';
import { bind } from '../../src/NSE/Bindings/propertyBinding';
import { NSESearchField } from '../../src/NSE/Controls/Fields/NSESearchField';
import { NSESlider } from '../../src/NSE/Controls/Values/NSESlider';
class Fields extends NSEObject {
  @observable accessor query = '';
  @observable accessor amount = 0;
  readonly fixed = 'constant';
  method() {}
}
const fields = new Fields();
bind(fields, 'query');
<NSESearchField binding={bind(fields,'query')} />;
<NSESlider binding={bind(fields,'amount')} />;
// @ts-expect-error missing property
bind(fields, 'missing');
// @ts-expect-error readonly property
bind(fields, 'fixed');
// @ts-expect-error method is not writable state
bind(fields, 'method');
// @ts-expect-error wrong binding value
<NSESearchField binding={bind(fields,'amount')} />;
// @ts-expect-error two value authorities
<NSESearchField binding={bind(fields,'query')} value="competing" />;
// @ts-expect-error second undo authority
<NSESlider binding={bind(fields,'amount')} undoManager={{}} />;
