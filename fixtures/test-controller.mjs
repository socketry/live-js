export default function(element) {
	element.textContent = 'Controller loaded!';
	return {
		dispose: function() {
			element.textContent = 'Controller disposed!';
		}
	};
}
