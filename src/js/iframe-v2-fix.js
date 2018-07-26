require(
	['cs_js/cs-full'],
	function (CS) {
		var prefix = CS.Util.configuratorPrefix;
		//Generic fix for flickering iframes
		//Will work for all iframes set in Text Display attribute type
		CS.DataBinder.registerHandler(
			CS.UI.TEXT_DISPLAY,
			(function UI_TextDisplay() {
				var oldHtmlValues = {};

				function shouldUpdateValue(element, newValue) {
					var valueBindingRef = CS.Service.getCurrentScreenRef() + ':' + element.id;
					// value has changed, or we have switched screens and it needs to be initialized
					if (oldHtmlValues[valueBindingRef] !== newValue || jQuery('<random></random>').html(newValue).html() !== element.innerHTML) {
						oldHtmlValues[valueBindingRef] = newValue;
						return true;
					}
					return false;
				}

				return {
					name: CS.UI.TEXT_DISPLAY,

					onChange: function() {
						// no-op
					},

					updateUI: function(binding, triggerEvent) {
						var displayHandler = {
							updateDisplay: function(element, value, displayValue) {
								if (shouldUpdateValue(element[0], value)) {
									jQuery(element).html(value);
								}
							},

							markRequired: CS.UI.Effects.markRequired
						};

						CS.UI.Effects.processEffects(binding, displayHandler);
					},

					updateAttribute: function(wrapper, properties) {
						if (properties.hasOwnProperty('value')) {
							properties.displayValue = CS.DataConverter.localizeValue(
								properties.value,
								{
									type: wrapper.definition[prefix + 'Data_Type__c'],
									scale: wrapper.definition[prefix + 'Scale__c']
								}
							);
						}
						CS.DataBinder.applyProperties(wrapper, properties);
					}
				};
			})(),
			true
		);
	}
);