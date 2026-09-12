<script>
	let { children, lang } = $props();
</script>

<figure data-lang={lang}>{@render children?.()}</figure>
