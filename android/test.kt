import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.FocusDirection

val x = focusProperties {
    exit = {
        if (it == FocusDirection.Up) FocusRequester.Default else FocusRequester.Cancel
    }
}
